"use client";

import { EmptyState, PageHeader, SkeletonGrid } from "@/components/ui";
import { formatElapsed, formatMoney } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Restaurant } from "@/lib/types";
import { elapsedFrom, isAwaitingKitchen, syncIsStale, ticketStatusLabel, useNow, useOrderStream } from "@/lib/use-order-stream";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function FloorPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const { orders: live, ready, connected, lastSyncAt, syncFailed } = useOrderStream(true);
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
              <Link href="/kitchen" className="btn btn-ink">
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
        ) : live.length === 0 ? (
          <EmptyState
            title="Get your first ticket in three steps"
            copy="Print a QR, open the kitchen screen, then order from a phone. Tickets appear here the moment they are sent."
            steps={[
              "Print a table QR on Tables",
              "Open the kitchen board on a laptop or tablet",
              "Scan the QR and send a test order",
            ]}
            action={
              <Link href="/app/tables" className="btn btn-chili">
                Print table QR codes
              </Link>
            }
          />
        ) : (
          <ul className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {live.map((order) => (
              <li key={order.id} className={`card p-4 rise-in ${!stale && isAwaitingKitchen(order, now) ? "ring-2 ring-[var(--chili)]" : ""}`}>
                <div className="flex justify-between text-xs uppercase tracking-widest text-[var(--ink-soft)]">
                  <span>
                    Table {order.tableNumber ?? "—"} · #{order.orderNumber}
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
        )}
      </div>
  );
}
