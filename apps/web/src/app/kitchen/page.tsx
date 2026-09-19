"use client";

import { AppShell } from "@/components/app-shell";
import { formatElapsed } from "@/lib/api";
import { getToken, getUser, SessionUser } from "@/lib/session";
import { Order, OrderItem } from "@/lib/types";
import { elapsedFrom, useNow, useOrderStream } from "@/lib/use-order-stream";
import { useEffect, useState } from "react";

const NEXT: Record<string, { label: string; status: string } | undefined> = {
  new: { label: "Accept & fire", status: "accepted" },
  accepted: { label: "Start cooking", status: "preparing" },
  preparing: { label: "Pass / ready", status: "ready" },
  ready: { label: "Served", status: "served" },
};

const ITEM_NEXT: Record<string, { label: string; status: "preparing" | "ready" } | undefined> = {
  pending: { label: "Start", status: "preparing" },
  preparing: { label: "Ready", status: "ready" },
};

function urgencyClass(seconds: number, status: string) {
  if (status === "ready") return "urgency-ok";
  if (seconds >= 12 * 60) return "urgency-hot";
  if (seconds >= 6 * 60) return "urgency-warn";
  return "urgency-ok";
}

export default function KitchenPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const now = useNow();
  const { orders, connected, ready, setOnCreated } = useOrderStream(true);

  useEffect(() => {
    setUser(getUser());
  }, []);

  useEffect(() => {
    setOnCreated(() => {
      if (audioUnlocked) beep();
    });
  }, [audioUnlocked, setOnCreated]);

  async function bump(order: Order) {
    const token = getToken();
    const step = NEXT[order.status];
    if (!token || !step) return;
    const { api } = await import("@/lib/api");
    await api(`/orders/${order.id}/status`, {
      method: "PATCH",
      token,
      json: { status: step.status },
    });
  }

  async function bumpItem(order: Order, item: OrderItem) {
    const token = getToken();
    const step = ITEM_NEXT[item.status ?? "pending"];
    if (!token || !step) return;
    const { api } = await import("@/lib/api");
    await api(`/orders/${order.id}/items/${item.id}/status`, {
      method: "PATCH",
      token,
      json: { status: step.status },
    });
  }

  const board = (
    <div className="kitchen-grid min-h-screen bg-[var(--board)] p-4 text-[var(--ticket)] md:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#c9b89a]">
            Kitchen display · {connected ? "live" : "reconnecting"}
          </p>
          <h1 className="display text-3xl md:text-4xl">{orders.length} live tickets</h1>
        </div>
        <button
          className="rounded-xl border border-[#c9b89a] px-3 py-2 text-xs uppercase tracking-widest"
          onClick={() => setAudioUnlocked(true)}
        >
          {audioUnlocked ? "Sound on" : "Enable ticket chime"}
        </button>
      </header>
      {!ready ? (
        <p className="text-sm text-[#c9b89a]">Connecting to the ticket stream…</p>
      ) : orders.length === 0 ? (
        <p className="max-w-md text-sm text-[#c9b89a]">
          No tickets on the board. When a guest scans and orders, the ticket lands here in real time
          with table, modifiers, and a clock.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
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
                      Table {order.tableNumber ?? "—"} · #{order.orderNumber}
                    </p>
                    <p className="text-lg font-semibold">{order.customerLabel}</p>
                  </div>
                  <span
                    className={`rounded-lg px-2 py-1 text-xs font-bold uppercase ${urgencyClass(
                      elapsed,
                      order.status,
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
                {order.note ? (
                  <p className="mt-3 border-t border-dashed border-[var(--rule)] pt-2 text-sm italic">
                    {order.note}
                  </p>
                ) : null}
                {NEXT[order.status] ? (
                  <button
                    className="btn btn-ink mt-4 w-full py-3"
                    onClick={() => bump(order)}
                  >
                    {NEXT[order.status]!.label}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );

  if (user?.role === "kitchen") return board;
  return <AppShell>{board}</AppShell>;
}

function beep() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.value = 0.05;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
}
