"use client";

import { AppShell } from "@/components/app-shell";
import { api, formatElapsed } from "@/lib/api";
import { getToken, getUser, SessionUser } from "@/lib/session";
import { Order } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

const NEXT: Record<string, { label: string; status: string } | undefined> = {
  new: { label: "Accept & fire", status: "accepted" },
  accepted: { label: "Start cooking", status: "preparing" },
  preparing: { label: "Pass / ready", status: "ready" },
  ready: { label: "Served", status: "served" },
};

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const known = useRef(new Set<string>());
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    setUser(getUser());
    const token = getToken();
    if (!token) return;
    const load = async () => {
      const next = await api<Order[]>("/orders?active=1", { token });
      if (audioUnlocked) {
        for (const order of next) {
          if (order.status === "new" && !known.current.has(order.id)) beep();
        }
      }
      known.current = new Set(next.map((o) => o.id));
      setOrders(next);
    };
    load().catch(() => undefined);
    const id = setInterval(() => load().catch(() => undefined), 1800);
    return () => clearInterval(id);
  }, [audioUnlocked]);

  async function bump(order: Order) {
    const token = getToken();
    const step = NEXT[order.status];
    if (!token || !step) return;
    await api(`/orders/${order.id}/status`, {
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
            Kitchen display
          </p>
          <h1 className="text-3xl" style={{ fontFamily: "var(--font-serif)" }}>
            {orders.length} live tickets
          </h1>
        </div>
        <button
          className="border border-[#c9b89a] px-3 py-2 text-xs uppercase tracking-widest"
          onClick={() => setAudioUnlocked(true)}
        >
          {audioUnlocked ? "Sound on" : "Enable ticket chime"}
        </button>
      </header>
      {orders.length === 0 ? (
        <p className="max-w-md text-sm text-[#c9b89a]">
          No tickets on the board. When a guest scans and orders, the ticket lands here with table,
          modifiers, and a clock.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <article
              key={order.id}
              className={`bg-[var(--ticket)] p-4 text-[var(--ink)] ${order.status === "new" ? "card-new" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                    Table {order.tableNumber ?? "—"} · #{order.orderNumber}
                  </p>
                  <p className="text-lg font-semibold">{order.customerLabel}</p>
                </div>
                <span
                  className={`px-2 py-1 text-xs font-bold uppercase ${
                    order.status === "new"
                      ? "bg-[#f3d0c8]"
                      : order.status === "preparing"
                        ? "bg-[#f3e3b6]"
                        : "bg-[#cfe3d6]"
                  }`}
                >
                  {formatElapsed(order.elapsedSeconds)}
                </span>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {order.items.map((item) => (
                  <li key={item.id}>
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
                  className="mt-4 w-full bg-[var(--ink)] py-3 text-sm font-semibold text-[var(--ticket)]"
                  onClick={() => bump(order)}
                >
                  {NEXT[order.status]!.label}
                </button>
              ) : null}
            </article>
          ))}
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
