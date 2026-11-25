"use client";

import { EmptyState, PageHeader } from "@/components/ui";
import { formatElapsed, formatMoney } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Order, Restaurant } from "@/lib/types";
import { elapsedFrom, ticketStatusLabel, useNow, useOrderStream } from "@/lib/use-order-stream";
import { useEffect, useState } from "react";

export default function OrdersPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const { orders, ready } = useOrderStream();
  const now = useNow();

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    import("@/lib/api").then(({ api }) =>
      api<Restaurant>("/restaurant", { token }).then(setRestaurant),
    );
  }, []);

  async function move(order: Order, status: string, rejectReason?: string) {
    const token = getToken();
    if (!token) return;
    setActionError("");
    try {
      const { api } = await import("@/lib/api");
      await api(`/orders/${order.id}/status`, {
        method: "PATCH",
        token,
        json: { status, reason: rejectReason },
      });
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update the ticket. Check its status and retry.");
      return false;
    }
  }

  return (
    <>
      <div className="p-5 md:p-8">
        <PageHeader
          kicker="Service"
          title="Tickets"
          copy="Accept, reject with a reason, or mark served. Updates land live from kitchen and floor."
        />
        {!rejecting && actionError ? <p role="alert" className="mt-4 rounded-xl bg-[#f3d0c8] p-3 text-sm">{actionError}</p> : null}
        {!ready ? (
          <div className="mt-8 skeleton h-48 w-full" />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No tickets yet"
            copy="When a guest orders from a table QR, tickets appear here."
            steps={["Print a table QR", "Send a test order from a phone"]}
          />
        ) : (
          <div className="card mt-6 overflow-x-auto p-2">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-widest text-[var(--ink-soft)]">
                <tr>
                  <th className="px-3 py-3">#</th>
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
                    <td className="px-3 py-3 font-semibold">{order.orderNumber}</td>
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
                    <td>{formatElapsed(elapsedFrom(order.createdAt, now))}</td>
                    <td>
                      {formatMoney(
                        order.totalMinor,
                        restaurant?.currency ?? "USD",
                        restaurant?.locale,
                      )}
                    </td>
                    <td>{ticketStatusLabel(order.status)}</td>
                    <td className="space-x-2 whitespace-nowrap px-3 py-3">
                      {order.status === "new" ? (
                        <>
                          <button className="underline" onClick={() => move(order, "accepted")}>
                            Accept for kitchen
                          </button>
                          <button className="underline" onClick={() => { setActionError(""); setRejecting(order); }}>
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
        )}
      </div>

      {rejecting ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
          <div className="glass card max-w-md p-6">
            <h2 className="display text-2xl">Reject ticket #{rejecting.orderNumber}</h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              The kitchen and floor will see this reason on the cancelled ticket.
            </p>
            <textarea
              className="field mt-4 min-h-24"
              placeholder="Sold out, allergy risk, kitchen closed…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {actionError ? <p role="alert" className="mt-2 text-sm text-[var(--chili)]">{actionError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                className="btn btn-chili flex-1"
                onClick={async () => {
                  if (!(await move(rejecting, "cancelled", reason.trim() || "Rejected"))) return;
                  setRejecting(null);
                  setReason("");
                  setActionError("");
                }}
              >
                Confirm reject
              </button>
              <button
                className="btn btn-ghost flex-1"
                onClick={() => {
                  setRejecting(null);
                  setReason("");
                  setActionError("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
