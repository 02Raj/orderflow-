"use client";

import { formatMoney } from "@/lib/api";
import type { Order, Restaurant } from "@/lib/types";
import { useEffect } from "react";

export type PrintKind = "kot" | "bill";

export function ThermalPrintSheet({
  order,
  restaurant,
  kind,
  onDone,
}: {
  order: Order | null;
  restaurant?: Restaurant | null;
  kind: PrintKind;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!order) return;
    const finish = () => onDone();
    window.addEventListener("afterprint", finish, { once: true });
    const timer = window.setTimeout(() => window.print(), 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", finish);
    };
  }, [kind, onDone, order]);

  if (!order) return null;
  const money = (amount: number) => formatMoney(amount, restaurant?.currency ?? "USD", restaurant?.locale);
  const destination = order.fulfillmentType === "takeaway"
    ? `TAKEAWAY · ${order.customerLabel || "Pickup"}`
    : `TABLE ${order.tableNumber ?? "—"}${order.tableLabel ? ` · ${order.tableLabel}` : ""}`;

  return (
    <section className="thermal-print-sheet" aria-hidden="true">
      <header className="thermal-center">
        <h1>{kind === "kot" ? "KITCHEN ORDER" : restaurant?.name ?? "GUEST BILL"}</h1>
        {kind === "bill" && restaurant?.address ? <p>{restaurant.address}</p> : null}
        {kind === "bill" && restaurant?.phone ? <p>{restaurant.phone}</p> : null}
      </header>
      <div className="thermal-rule" />
      <p className="thermal-large">#{order.orderNumber} · {destination}</p>
      <p>{new Date(order.createdAt).toLocaleString(restaurant?.locale)}</p>
      <p>Customer: {order.customerLabel || "Guest"}</p>
      <div className="thermal-rule" />
      {order.items.map((item) => (
        <div className="thermal-item" key={item.id}>
          <div>
            <strong>{item.quantity} × {item.name}</strong>
            {item.modifiers?.map((modifier) => <p key={modifier.name}>+ {modifier.name}</p>)}
            {item.note ? <p>NOTE: {item.note}</p> : null}
          </div>
          {kind === "bill" ? <span>{money(item.lineTotalMinor ?? 0)}</span> : null}
        </div>
      ))}
      {order.note ? <p className="thermal-note">ORDER NOTE: {order.note}</p> : null}
      {kind === "bill" ? (
        <>
          <div className="thermal-rule" />
          <div className="thermal-total"><span>Subtotal</span><span>{money(order.subtotalMinor)}</span></div>
          <div className="thermal-total"><span>{restaurant?.taxLabel ?? "Tax"}</span><span>{money(order.taxMinor)}</span></div>
          <div className="thermal-total thermal-large"><strong>Total</strong><strong>{money(order.totalMinor)}</strong></div>
          {order.paidMinor > 0 && <div className="thermal-total"><span>Payment recorded</span><span>{money(order.paidMinor)}</span></div>}
          <p className="thermal-center thermal-footer">Thank you!</p>
        </>
      ) : (
        <p className="thermal-center thermal-footer">KOT · #{order.orderNumber}</p>
      )}
    </section>
  );
}
