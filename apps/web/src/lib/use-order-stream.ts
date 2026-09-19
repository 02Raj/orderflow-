import { API_BASE } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Order } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

const CLOSED = new Set(["served", "cancelled", "void"]);

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
  const known = useRef(new Set<string>());
  const onCreated = useRef<((order: Order) => void) | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    let source: EventSource | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let retry = 0;

    const path = activeOnly ? "/orders?active=1" : "/orders";

    const merge = (incoming: Order, type?: string) => {
      if (type === "created" && !known.current.has(incoming.id)) {
        onCreated.current?.(incoming);
      }
      known.current.add(incoming.id);
      setOrders((prev) => {
        const without = prev.filter((o) => o.id !== incoming.id);
        if (activeOnly && CLOSED.has(incoming.status)) return without;
        return [incoming, ...without].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      });
    };

    const load = async () => {
      const { api } = await import("@/lib/api");
      const next = await api<Order[]>(path, { token });
      if (cancelled) return;
      known.current = new Set(next.map((o) => o.id));
      setOrders(next);
      setReady(true);
    };

    const startPoll = () => {
      if (pollId) return;
      setConnected(false);
      pollId = setInterval(() => {
        load().catch(() => undefined);
      }, 2500);
    };

    const startSse = () => {
      const url = `${API_BASE}/orders/stream?access_token=${encodeURIComponent(token)}`;
      source = new EventSource(url);
      source.addEventListener("ready", () => {
        setConnected(true);
        retry = 0;
        if (pollId) {
          clearInterval(pollId);
          pollId = null;
        }
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
        setConnected(false);
        startPoll();
        const wait = Math.min(8000, 800 * 2 ** retry++);
        window.setTimeout(() => {
          if (!cancelled) startSse();
        }, wait);
      };
    };

    load()
      .then(startSse)
      .catch(() => {
        setReady(true);
        startPoll();
      });

    return () => {
      cancelled = true;
      source?.close();
      if (pollId) clearInterval(pollId);
    };
  }, [activeOnly]);

  const setOnCreated = useCallback((fn: (order: Order) => void) => {
    onCreated.current = fn;
  }, []);

  return {
    orders,
    setOrders,
    connected,
    ready,
    setOnCreated,
  };
}
