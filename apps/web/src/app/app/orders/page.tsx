"use client";

import { AppShell } from "@/components/app-shell";
import { api, formatElapsed, formatMoney } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Order, Restaurant } from "@/lib/types";
import { useEffect, useState } from "react";

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const load = () => api<Order[]>("/orders", { token }).then(setOrders);
    api<Restaurant>("/restaurant", { token }).then(setRestaurant);
    load().catch(() => setOrders([]));
    const id = setInterval(() => load().catch(() => undefined), 2500);
    return () => clearInterval(id);
  }, []);

  async function move(order: Order, status: string) {
    const token = getToken();
    if (!token) return;
    await api(`/orders/${order.id}/status`, { method: "PATCH", token, json: { status } });
    setOrders(await api<Order[]>("/orders", { token }));
  }

  return (
    <AppShell>
      <div className="p-5 md:p-8">
        <h1 className="text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
          Tickets
        </h1>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-widest text-[var(--ink-soft)]">
              <tr>
                <th className="py-2">#</th>
                <th>Table</th>
                <th>Items</th>
                <th>Age</th>
                <th>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-[var(--rule)] align-top">
                  <td className="py-3">{order.orderNumber}</td>
                  <td>{order.tableNumber ?? "—"}</td>
                  <td>
                    {order.items.map((item) => (
                      <div key={item.id}>
                        {item.quantity}× {item.name}
                        {item.modifiers?.length ? (
                          <span className="text-[var(--ink-soft)]">
                            {" "}
                            ({item.modifiers.map((m) => m.name).join(", ")})
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </td>
                  <td>{formatElapsed(order.elapsedSeconds)}</td>
                  <td>
                    {formatMoney(
                      order.totalMinor,
                      restaurant?.currency ?? "USD",
                      restaurant?.locale,
                    )}
                  </td>
                  <td className="capitalize">{order.status}</td>
                  <td className="space-x-2 whitespace-nowrap">
                    {order.status === "new" ? (
                      <>
                        <button className="underline" onClick={() => move(order, "accepted")}>
                          Accept
                        </button>
                        <button className="underline" onClick={() => move(order, "cancelled")}>
                          Reject
                        </button>
                      </>
                    ) : null}
                    {order.status === "ready" ? (
                      <button className="underline" onClick={() => move(order, "served")}>
                        Served
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
