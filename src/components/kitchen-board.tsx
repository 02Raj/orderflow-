"use client";

import { ThermalPrintSheet } from "@/components/thermal-print-sheet";
import { api, formatElapsed } from "@/lib/api";
import { DEFAULT_KITCHEN_TARGETS, readKitchenTargets, type KitchenTargets } from "@/lib/kitchen-targets";
import { playNewOrderSound, playReadyBellSound, playUrgentAlertSound } from "@/lib/kitchen-sound";
import { getToken } from "@/lib/session";
import { Order, OrderItem, Restaurant } from "@/lib/types";
import { KITCHEN_ACK_SECONDS, elapsedFrom, isAwaitingKitchen, syncIsStale, useNow, useOrderStream } from "@/lib/use-order-stream";
import { useCallback, useEffect, useRef, useState } from "react";

const NEXT: Record<string, { label: string; status: string } | undefined> = {
  new: { label: "Accept", status: "accepted" },
  accepted: { label: "Start cooking", status: "preparing" },
  preparing: { label: "Ready", status: "ready" },
  ready: { label: "Served", status: "served" },
};

const ITEM_NEXT: Record<string, { label: string; status: "preparing" | "ready" } | undefined> = {
  pending: { label: "Start", status: "preparing" },
  preparing: { label: "Ready", status: "ready" },
};

function urgencyClass(seconds: number, status: string, targets: KitchenTargets) {
  if (status === "ready") return "urgency-ok";
  if (seconds >= targets.forgottenMinutes * 60) return "urgency-hot";
  if (seconds >= targets.targetMinutes * 60) return "urgency-warn";
  return "urgency-ok";
}

export function KitchenBoard() {
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [actionError, setActionError] = useState("");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [legacyTargets, setLegacyTargets] = useState(DEFAULT_KITCHEN_TARGETS);
  const [recent, setRecent] = useState<Order[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [lastServed, setLastServed] = useState<Order | null>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const now = useNow();
  const { orders, connected, ready, lastSyncAt, syncFailed, setOnCreated, setOnStatusChange } = useOrderStream(true);
  const queue = [...orders].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.orderNumber - b.orderNumber);
  const stale = syncIsStale(lastSyncAt, now) || (syncFailed && !ready);
  const pending = orders.filter((order) => isAwaitingKitchen(order, now));
  const ordersRef = useRef(orders);
  const lastAlarm = useRef(0);
  const targets = restaurant?.kitchenTargetMinutes != null && restaurant.kitchenUrgentMinutes != null
    ? { targetMinutes: restaurant.kitchenTargetMinutes, forgottenMinutes: restaurant.kitchenUrgentMinutes }
    : legacyTargets;

  useEffect(() => { ordersRef.current = orders; }, [orders]);

  useEffect(() => {
    if (!audioUnlocked || stale) return;
    const id = window.setInterval(() => {
      const time = Date.now();
      if (ordersRef.current.some((order) => isAwaitingKitchen(order, time)) && time - lastAlarm.current >= 30000) {
        playUrgentAlertSound();
        lastAlarm.current = Date.now();
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [audioUnlocked, stale]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    function refresh() {
      void api<Restaurant>("/restaurant", { token, signal: controller.signal }).then((venue) => {
        setRestaurant(venue);
        setLegacyTargets(readKitchenTargets());
      }).catch(() => undefined);
    }
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    setOnCreated(() => {
      if (audioUnlocked) playNewOrderSound();
    });
    setOnStatusChange((order) => {
      if (!audioUnlocked) return;
      if (order.status === "ready" || order.status === "served") {
        playReadyBellSound();
      }
    });
  }, [audioUnlocked, setOnCreated, setOnStatusChange]);

  async function bump(order: Order) {
    const token = getToken();
    const step = NEXT[order.status];
    if (!token || !step) return;
    setActionError("");
    try {
      const updated = await api<Order>(`/orders/${order.id}/status`, {
        method: "PATCH",
        token,
        json: {
          status: step.status,
          completeItems: step.status === "ready" && order.items.some((item) => item.status !== "ready"),
          expectedUpdatedAt: order.updatedAt,
        },
      });
      if (step.status === "ready" || step.status === "served") {
        if (audioUnlocked) playReadyBellSound();
      }
      if (step.status === "served") {
        setLastServed(updated);
        window.setTimeout(() => setLastServed((current) => current?.id === updated.id ? null : current), 10000);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update the ticket. Check its status and retry.");
    }
  }

  async function acknowledge(order: Order) {
    const token = getToken();
    if (!token) return;
    setActionError("");
    try {
      await api(`/orders/${order.id}/acknowledge-corrections`, {
        method: "POST", token, json: { summary: order.correctionSummary },
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not acknowledge the changes.");
    }
  }

  async function bumpItem(order: Order, item: OrderItem) {
    const token = getToken();
    const step = ITEM_NEXT[item.status ?? "pending"];
    if (!token || !step) return;
    setActionError("");
    try {
      await api(`/orders/${order.id}/items/${item.id}/status`, { method: "PATCH", token, json: { status: step.status } });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update this item.");
    }
  }

  async function recall(order: Order) {
    const token = getToken();
    if (!token) return;
    setActionError("");
    try {
      await api<Order>(`/orders/${order.id}/recall`, { method: "POST", token });
      setRecent((tickets) => tickets.filter((ticket) => ticket.id !== order.id));
      setLastServed(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not recall this ticket.");
    }
  }

  async function openRecentlyServed() {
    const token = getToken();
    if (!token) return;
    setShowRecent(true);
    setLoadingRecent(true);
    setActionError("");
    try {
      setRecent(await api<Order[]>("/orders?recentServed=1", { token }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not load recently served tickets.");
    } finally {
      setLoadingRecent(false);
    }
  }

  const finishPrinting = useCallback(() => setPrintOrder(null), []);

  return (
    <div className="kitchen-grid min-h-screen bg-[var(--board)] p-4 text-[var(--ticket)] md:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#c9b89a]">
            Kitchen display · {stale ? "sync delayed" : connected ? "live" : "syncing"}
          </p>
          <h1 className="display text-3xl md:text-4xl">{ready ? `${orders.length} open tickets` : "Kitchen tickets"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-xl bg-white/10 px-3 py-2 text-xs text-[#eadbc2]" title="Kitchen timer settings">
            Target {targets.targetMinutes}m · urgent {targets.forgottenMinutes}m
          </span>
          <button className="rounded-xl border border-[#c9b89a] px-3 py-2 text-xs uppercase tracking-widest" onClick={openRecentlyServed}>
            Recently served
          </button>
          <button
            className={`rounded-xl border px-3 py-2 text-xs uppercase tracking-widest transition ${
              audioUnlocked
                ? "border-[#4ade80]/60 bg-[#4ade80]/15 text-[#cfe3d6]"
                : "border-[#c9b89a] text-[var(--ticket)]"
            }`}
            onClick={() => {
              if (!audioUnlocked) {
                setAudioUnlocked(true);
                playNewOrderSound();
              } else {
                setAudioUnlocked(false);
              }
            }}
          >
            {audioUnlocked ? "Sound on · Mute" : "Enable ticket chime"}
          </button>
        </div>
      </header>
      {actionError ? <p role="alert" className="mb-5 rounded-xl bg-[#f3d0c8] p-4 text-[var(--ink)]">{actionError}</p> : null}
      {stale ? (
        <p role="alert" className="mb-5 rounded-xl bg-[#fff4d6] p-4 text-[var(--ink)]">
          Ticket sync is delayed. Take new orders on paper until the board reconnects. Check pending digital tickets with the floor before preparing them again.
        </p>
      ) : pending.length > 0 ? (
        <div role="alert" className="mb-5 rounded-xl bg-[#f3d0c8] p-4 font-semibold text-[var(--ink)]">
          {pending.length} ticket{pending.length === 1 ? "" : "s"} waiting at least {KITCHEN_ACK_SECONDS} seconds for kitchen acceptance.
          Check the new tickets below.
        </div>
      ) : null}
      {!ready ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex justify-between">
                <div className="h-4 w-24 rounded bg-white/10" />
                <div className="h-5 w-14 rounded bg-white/10" />
              </div>
              <div className="mt-5 space-y-2.5">
                <div className="h-4 w-3/4 rounded bg-white/10" />
                <div className="h-4 w-1/2 rounded bg-white/10" />
                <div className="h-4 w-2/3 rounded bg-white/10" />
              </div>
              <div className="mt-8 h-10 w-full rounded-xl bg-white/10" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <p className="max-w-md text-sm text-[#c9b89a]">
          No tickets on the board. When a guest scans and orders, the ticket lands here in real time
          with table, modifiers, and a clock.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {queue.map((order) => {
            const elapsed = elapsedFrom(order.createdAt, now);
            return (
              <article
                key={order.id}
                className={`rounded-2xl bg-[var(--ticket)] p-4 text-[var(--ink)] ${
                  order.status === "new" ? "card-new" : "rise-in"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                      {order.fulfillmentType === "takeaway" ? "TAKEAWAY" : `TABLE ${order.tableNumber ?? "—"}`} · #{order.orderNumber}
                    </p>
                    <p className="text-lg font-semibold">{order.customerLabel}</p>
                  </div>
                  <span
                    className={`rounded-lg px-2 py-1 text-xs font-bold uppercase ${urgencyClass(
                      elapsed,
                      order.status,
                      targets,
                    )}`}
                  >
                    {formatElapsed(elapsed)}
                  </span>
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-2">
                      <div>
                        <strong>
                          {item.quantity}× {item.name}
                        </strong>
                        {item.modifiers?.map((m) => (
                          <div key={m.name} className="pl-4 text-[var(--chili)]">
                            + {m.name}
                          </div>
                        ))}
                        {item.note ? (
                          <div className="pl-4 italic text-[var(--ink-soft)]">{item.note}</div>
                        ) : null}
                      </div>
                      {ITEM_NEXT[item.status ?? "pending"] ? (
                        <button
                          className="shrink-0 rounded-lg border border-[var(--rule)] px-2 py-1 text-[11px] uppercase tracking-wider"
                          onClick={() => bumpItem(order, item)}
                        >
                          {ITEM_NEXT[item.status ?? "pending"]!.label}
                        </button>
                      ) : (
                        <span className="shrink-0 text-[11px] uppercase tracking-wider text-[var(--sage)]">
                          {item.status}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {order.correctionSummary && <div className="mt-3 rounded-lg bg-[#fff4d6] p-3 text-sm">
                  <strong>Changes to review</strong>
                  <p className="mt-1 whitespace-pre-line">{order.correctionSummary}</p>
                  <button type="button" className="mt-1 min-h-10 underline" onClick={() => acknowledge(order)}>Acknowledge changes</button>
                </div>}
                {order.note ? (
                  <p className="mt-3 border-t border-dashed border-[var(--rule)] pt-2 text-sm italic">
                    {order.note}
                  </p>
                ) : null}
                <button type="button" className="mt-3 min-h-10 w-full rounded-lg border border-[var(--rule)] px-3 text-xs font-semibold uppercase tracking-wider"
                  onClick={() => setPrintOrder(order)}>Print KOT</button>
                {order.fulfillmentType === "takeaway" && order.status === "ready" ? (
                  <p className="mt-4 text-sm font-semibold text-[var(--sage)]">Ready for counter pickup</p>
                ) : NEXT[order.status] ? (
                  <button
                    className="btn btn-ink mt-4 w-full py-3"
                    onClick={() => bump(order)}
                  >
                    {order.status === "preparing" && order.items.some((item) => item.status !== "ready") ? "Mark all items ready" : NEXT[order.status]!.label}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      {lastServed ? <div role="status" className="fixed bottom-4 left-1/2 z-40 flex w-[min(92vw,28rem)] -translate-x-1/2 items-center justify-between gap-3 rounded-xl bg-[var(--ticket)] p-3 text-sm text-[var(--ink)] shadow-2xl">
        <span>Ticket #{lastServed.orderNumber} marked served.</span>
        <button type="button" className="btn btn-chili min-h-11" onClick={() => recall(lastServed)}>Undo</button>
      </div> : null}
      {showRecent ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="recent-heading">
        <section className="card max-h-[85dvh] w-full max-w-xl overflow-y-auto p-5 text-[var(--ink)]">
          <div className="flex items-start justify-between gap-3">
            <div><h2 id="recent-heading" className="display text-2xl">Recently served</h2><p className="text-sm text-[var(--ink-soft)]">Recall tickets served in the last 30 minutes.</p></div>
            <button type="button" className="btn btn-ghost min-h-11" onClick={() => setShowRecent(false)}>Close</button>
          </div>
          {loadingRecent ? <p className="mt-5 text-sm">Loading…</p> : recent.length === 0 ? <p className="mt-5 rounded-xl bg-[var(--paper)] p-4 text-sm">No recallable tickets.</p> : <ul className="mt-4 space-y-2">
            {recent.map((order) => <li key={order.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--rule)] p-3">
              <div><strong>#{order.orderNumber} · {order.fulfillmentType === "takeaway" ? `Takeaway · ${order.customerLabel}` : `Table ${order.tableNumber}`}</strong><p className="text-xs text-[var(--ink-soft)]">{order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}</p></div>
              <button type="button" className="btn btn-chili min-h-11 shrink-0" onClick={() => recall(order)}>Recall</button>
            </li>)}
          </ul>}
        </section>
      </div> : null}
      <ThermalPrintSheet order={printOrder} restaurant={restaurant} kind="kot" onDone={finishPrinting} />
    </div>
  );
}
