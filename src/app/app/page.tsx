"use client";

import { AppShell } from "@/components/app-shell";
import { EmptyState, PageHeader, SkeletonGrid } from "@/components/ui";
import { formatElapsed, formatMoney } from "@/lib/api";
import { getToken } from "@/lib/session";
import { Restaurant } from "@/lib/types";
import { elapsedFrom, useNow, useOrderStream } from "@/lib/use-order-stream";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function FloorPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const { orders, ready, connected } = useOrderStream(true);
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
  const live = orders.filter((o) => ["new", "accepted", "preparing", "ready"].includes(o.status));

  return (
    <AppShell>
      <div className="p-5 md:p-8">
        <PageHeader
          kicker={`Floor · ${connected ? "live" : "syncing"}`}
          title={`${live.length} open tickets`}
          actions={
            <>
              <Link href="/kitchen" className="btn btn-ink">
                Open kitchen board
              </Link>
              <Link href="/app/menu" className="btn btn-ghost">
                Edit menu
              </Link>
            </>
          }
        />

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
              <li key={order.id} className="card p-4 rise-in">
                <div className="flex justify-between text-xs uppercase tracking-widest text-[var(--ink-soft)]">
                  <span>
                    Table {order.tableNumber ?? "—"} · #{order.orderNumber}
                  </span>
                  <span className={order.status === "new" ? "text-[var(--chili)]" : ""}>
                    {order.status} · {formatElapsed(elapsedFrom(order.createdAt, now))}
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
