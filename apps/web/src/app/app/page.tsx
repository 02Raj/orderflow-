"use client";

import { AppShell } from "@/components/app-shell";
import { api, formatElapsed, formatMoney } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Order, Restaurant } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function FloorPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const load = () => {
      api<Order[]>("/orders?active=1", { token }).then(setOrders).catch(() => setOrders([]));
    };
    api<Restaurant>("/restaurant", { token }).then(setRestaurant);
    load();
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, []);

  const currency = restaurant?.currency ?? "USD";
  const locale = restaurant?.locale ?? "en-US";
  const live = orders.filter((o) => ["new", "accepted", "preparing", "ready"].includes(o.status));

  return (
    <AppShell>
      <div className="p-5 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--chili)]">
              Live floor
            </p>
            <h1 className="mt-1 text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
              {live.length} open tickets
            </h1>
          </div>
          <div className="flex gap-2">
            <Link href="/kitchen" className="bg-[var(--ink)] px-4 py-2 text-sm text-[var(--ticket)]">
              Open kitchen board
            </Link>
            <Link href="/app/menu" className="border border-[var(--ink)] px-4 py-2 text-sm">
              Edit menu
            </Link>
          </div>
        </div>

        {live.length === 0 ? (
          <div className="mt-10 max-w-xl border border-dashed border-[var(--rule)] p-8">
            <h2 className="text-2xl" style={{ fontFamily: "var(--font-serif)" }}>
              Waiting on the first scan
            </h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Print a table QR, open the kitchen board on a spare laptop, and place a test order from
              your phone. If tickets do not appear here, the product is not working — nothing else
              matters yet.
            </p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {live.map((order) => (
              <li key={order.id} className="ticket-shadow bg-[var(--ticket)] p-4">
                <div className="flex justify-between text-xs uppercase tracking-widest text-[var(--ink-soft)]">
                  <span>
                    Table {order.tableNumber ?? "—"} · #{order.orderNumber}
                  </span>
                  <span className={order.status === "new" ? "text-[var(--chili)]" : ""}>
                    {order.status} · {formatElapsed(order.elapsedSeconds)}
                  </span>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity}× {item.name}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm font-semibold">
                  {formatMoney(order.totalMinor, currency, locale)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
