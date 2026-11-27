"use client";

import { EmptyState, PageHeader, SkeletonGrid } from "@/components/ui";
import { api, formatElapsed, formatMoney } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Restaurant } from "@/lib/types";
import { elapsedFrom, isAwaitingKitchen, syncIsStale, ticketStatusLabel, useNow, useOrderStream } from "@/lib/use-order-stream";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function FloorPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const { orders: live, setOrders, ready, connected, lastSyncAt, syncFailed } = useOrderStream(true);
  const [pickupBusy, setPickupBusy] = useState<string | null>(null);
  const [pickupMessage, setPickupMessage] = useState("");
  const [pickupError, setPickupError] = useState("");
  const now = useNow();

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    import("@/lib/api").then(({ api }) =>
      api<Restaurant>("/restaurant", { token }).then(setRestaurant),
    );
  }, []);

  const currency = restaurant?.currency ?? "USD";
  const locale = restaurant?.locale ?? "en-US";
  const stale = syncIsStale(lastSyncAt, now) || (syncFailed && !ready);
  const overdue = live.filter((order) => isAwaitingKitchen(order, now));
  const pickups = live.filter((order) => order.fulfillmentType === "takeaway" && order.status === "ready")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const otherTickets = live.filter((order) => !pickups.some((pickup) => pickup.id === order.id));

  async function handOver(id: string, number: number) {
    const token = getToken();
    if (!token || pickupBusy) return;
    setPickupBusy(id);
    setPickupError("");
    setPickupMessage("");
    try {
      await api(`/orders/${id}/status`, { method: "PATCH", token, json: { status: "served" } });
      setOrders((current) => current.filter((ticket) => ticket.id !== id));
      setPickupMessage(`Pickup #${number} handed over.`);
    } catch (error) {
      setPickupError(error instanceof Error ? error.message : "Could not confirm handover.");
    } finally {
      setPickupBusy(null);
    }
  }

  return (
    <div className="p-5 md:p-8">
        <PageHeader
          kicker={`Floor · ${stale ? "sync delayed" : connected ? "live" : "syncing"}`}
          title={ready ? `${live.length} open tickets` : "Open tickets"}
          actions={
            <>
              <Link href="/app/take-order" className="btn btn-chili">
                Take an order
              </Link>
              <Link href="/app/kitchen" className="btn btn-ink">
                Open kitchen board
              </Link>
              <Link href="/app/menu" className="btn btn-ghost">
                Edit menu
              </Link>
            </>
          }
        />

        {stale ? (
          <p role="alert" className="mt-4 rounded-xl bg-[#fff4d6] p-3 text-sm">
            Ticket sync is delayed. Confirm urgent orders directly with the kitchen while the board reconnects.
          </p>
        ) : overdue.length > 0 ? (
          <div role="alert" className="mt-4 rounded-xl bg-[#f3d0c8] p-3 text-sm">
            <strong>Check with the kitchen.</strong> These tickets are still awaiting acceptance.
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {overdue.map((order) => (
                <li key={order.id}>
                  {order.tableNumber == null ? "" : `Table ${order.tableNumber} · `}#{order.orderNumber}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {!ready ? (
          <SkeletonGrid />
        ) : (
          <>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="card p-4">
                <dt className="text-xs font-semibold uppercase tracking-widest text-[var(--ink-soft)]">Open tickets</dt>
                <dd className="display mt-1 text-3xl">{live.length}</dd>
              </div>
              <div className="card p-4">
                <dt className="text-xs font-semibold uppercase tracking-widest text-[var(--ink-soft)]">Awaiting kitchen</dt>
                <dd className="display mt-1 text-3xl text-[var(--chili-dark)]">{overdue.length}</dd>
              </div>
              <div className="card p-4">
                <dt className="text-xs font-semibold uppercase tracking-widest text-[var(--ink-soft)]">Ready for pickup</dt>
                <dd className="display mt-1 text-3xl text-[var(--sage)]">{pickups.length}</dd>
              </div>
              <div className="card p-4">
                <dt className="text-xs font-semibold uppercase tracking-widest text-[var(--ink-soft)]">QR ordering</dt>
                <dd className="display mt-1 text-3xl">{restaurant?.orderingPaused ? "Paused" : "Active"}</dd>
              </div>
            </dl>

            <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
              <section aria-labelledby="pickup-heading" className="card p-5">
                <h2 id="pickup-heading" className="display text-2xl">Ready for pickup</h2>
                {pickupError && <p role="alert" className="mt-2 text-sm text-[var(--chili-dark)]">{pickupError}</p>}
                {pickupMessage && <p role="status" className="mt-2 text-sm">{pickupMessage}</p>}
                {pickups.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">No takeaway orders waiting for handover.</p>
                ) : (
                  <ul className="mt-3 grid gap-2">
                    {pickups.map((order) => (
                      <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--rule)] p-3">
                        <div>
                          <strong>#{order.orderNumber} · {order.customerLabel}</strong>
                          <p className="text-xs text-[var(--ink-soft)]">
                            {order.paidMinor > 0 ? "Payment recorded" : order.totalMinor > 0 ? "Payment not recorded" : "No charge"}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={stale || pickupBusy !== null}
                          className="btn btn-ink min-h-11"
                          onClick={() => handOver(order.id, order.orderNumber)}
                        >
                          {pickupBusy === order.id ? "Saving…" : "Handed over"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {live.length === 0 ? (
                <div className="card p-6">
                  <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[#f3d0c8] text-lg">⌀</div>
                  <h2 className="display text-2xl">Get your first ticket in three steps</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                    Print a QR, open the kitchen screen, then order from a phone. Tickets appear here the moment they are sent.
                  </p>
                  <ol className="mt-4 space-y-2 text-sm">
                    {[
                      "Print a table QR on Tables",
                      "Open the kitchen board on a laptop or tablet",
                      "Scan the QR and send a test order",
                    ].map((step, i) => (
                      <li key={step} className="flex gap-3">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--paper-2)] text-xs font-semibold">
                          {i + 1}
                        </span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                  <Link href="/app/tables" className="btn btn-chili mt-5">
                    Print table QR codes
                  </Link>
                </div>
              ) : (
                <section className="card p-5">
                  <h2 className="display text-2xl">Live kitchen queue</h2>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">Tap Kitchen in the sidebar to bump items or print KOTs.</p>
                </section>
              )}
            </div>
          </>
        )}
        {ready && live.length > 0 ? (
          <ul className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {otherTickets.map((order) => (
              <li key={order.id} className={`card p-4 rise-in ${!stale && isAwaitingKitchen(order, now) ? "ring-2 ring-[var(--chili)]" : ""}`}>
                <div className="flex justify-between text-xs uppercase tracking-widest text-[var(--ink-soft)]">
                  <span>
                    {order.fulfillmentType === "takeaway" ? `Takeaway · ${order.customerLabel}` : `Table ${order.tableNumber ?? "—"}`} · #{order.orderNumber}
                  </span>
                  <span className={order.status === "new" ? "text-[var(--chili)]" : ""}>
                    {ticketStatusLabel(order.status)} · {formatElapsed(elapsedFrom(order.createdAt, now))}
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
        ) : null}
      </div>
  );
}
