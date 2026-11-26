import { API_BASE, api } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Order } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

const CLOSED = new Set(["served", "cancelled", "void"]);
const POLL_MS = 5000;
export const KITCHEN_ACK_SECONDS = 45;

const STATUS_LABELS: Record<string, string> = {
  new: "Waiting for kitchen",
  accepted: "Accepted by kitchen",
  preparing: "Preparing",
  ready: "Ready to serve",
  served: "Served",
  cancelled: "Cancelled",
  void: "Voided",
};

export function ticketStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export function isAwaitingKitchen(order: Order, now: number) {
  return order.status === "new" && elapsedFrom(order.createdAt, now) >= KITCHEN_ACK_SECONDS;
}

export function syncIsStale(lastSyncAt: number | null, now: number) {
  return lastSyncAt !== null && now - lastSyncAt >= 3 * POLL_MS;
}

function mergeTicket(orders: Order[], incoming: Order, activeOnly: boolean) {
  const previous = orders.find((order) => order.id === incoming.id);
  if (previous && Date.parse(previous.updatedAt) > Date.parse(incoming.updatedAt)) return orders;
  const remaining = orders.filter((order) => order.id !== incoming.id);
  if (!activeOnly || !CLOSED.has(incoming.status)) remaining.push(incoming);
  return remaining.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function elapsedFrom(createdAt: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useOrderStream(activeOnly = false) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const onCreated = useRef<((order: Order) => void) | null>(null);
  const onStatusChange = useRef<((order: Order, previousStatus: string) => void) | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    let source: EventSource | null = null;
    let reconnectId: number | undefined;
    let retry = 0;
    let initialized = false;
    let inFlight: AbortController | null = null;
    const known = new Map<string, string>();
    const duringLoad: Order[] = [];

    const path = activeOnly ? "/orders?active=1" : "/orders";

    const merge = (incoming: Order, type?: string) => {
      const prevStatus = known.get(incoming.id);
      if (type === "created" && !prevStatus) {
        onCreated.current?.(incoming);
      } else if (prevStatus && prevStatus !== incoming.status) {
        onStatusChange.current?.(incoming, prevStatus);
      }
      known.set(incoming.id, incoming.status);
      if (inFlight) duringLoad.push(incoming);
      setOrders((prev) => mergeTicket(prev, incoming, activeOnly));
    };

    const load = async () => {
      if (cancelled || inFlight) return;
      const controller = new AbortController();
      inFlight = controller;
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const snapshot = await api<Order[]>(path, { token, signal: controller.signal });
        if (cancelled) return;
        // A live status change can arrive while the database snapshot is in flight.
        const next = duringLoad.reduce((orders, order) => mergeTicket(orders, order, activeOnly), snapshot);
        for (const order of next) {
          const prevStatus = known.get(order.id);
          if (initialized) {
            if (!prevStatus && order.status === "new") {
              onCreated.current?.(order);
            } else if (prevStatus && prevStatus !== order.status) {
              onStatusChange.current?.(order, prevStatus);
            }
          }
          known.set(order.id, order.status);
        }
        setOrders(next);
        setReady(true);
        setLastSyncAt(Date.now());
        setSyncFailed(false);
        initialized = true;
      } catch {
        if (!cancelled) setSyncFailed(true);
      } finally {
        window.clearTimeout(timeout);
        duringLoad.length = 0;
        inFlight = null;
      }
    };

    const startSse = () => {
      const url = `${API_BASE}/orders/stream?access_token=${encodeURIComponent(token)}`;
      source = new EventSource(url);
      source.addEventListener("ready", () => {
        setConnected(true);
        retry = 0;
        void load();
      });
      const handle = (type: string) => (ev: MessageEvent) => {
        try {
          merge(JSON.parse(ev.data) as Order, type);
        } catch {
          /* ignore malformed */
        }
      };
      source.addEventListener("order:created", handle("created"));
      source.addEventListener("order:updated", handle("updated"));
      source.onerror = () => {
        source?.close();
        source = null;
        if (cancelled) return;
        setConnected(false);
        void load();
        const wait = Math.min(8000, 800 * 2 ** retry++);
        reconnectId = window.setTimeout(() => {
          if (!cancelled) startSse();
        }, wait);
      };
    };

    const pollId = window.setInterval(load, POLL_MS);
    window.addEventListener("online", load);
    void load();
    startSse();

    return () => {
      cancelled = true;
      source?.close();
      inFlight?.abort();
      window.clearTimeout(reconnectId);
      window.clearInterval(pollId);
      window.removeEventListener("online", load);
    };
  }, [activeOnly]);

  const setOnCreated = useCallback((fn: (order: Order) => void) => {
    onCreated.current = fn;
  }, []);

  const setOnStatusChange = useCallback((fn: (order: Order, previousStatus: string) => void) => {
    onStatusChange.current = fn;
  }, []);

  return {
    orders,
    setOrders,
    connected,
    ready,
    lastSyncAt,
    syncFailed,
    setOnCreated,
    setOnStatusChange,
  };
}
