"use client";

import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { getToken } from "@/lib/session";
import { DiningTable, Restaurant } from "@/lib/types";
import { FormEvent, useEffect, useState } from "react";
import QRCode from "qrcode";

export default function TablesPage() {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [number, setNumber] = useState("9");
  const [label, setLabel] = useState("");

  async function reload() {
    const token = getToken();
    if (!token) return;
    const [t, r] = await Promise.all([
      api<DiningTable[]>("/tables", { token }),
      api<Restaurant>("/restaurant", { token }),
    ]);
    setTables(t);
    setRestaurant(r);
    const origin = window.location.origin;
    const next: Record<string, string> = {};
    for (const table of t) {
      next[table.id] = await QRCode.toDataURL(`${origin}/m/${r.slug}/${table.qrToken}`, {
        margin: 1,
        width: 280,
        color: { dark: "#1c1612", light: "#fff8ea" },
      });
    }
    setCodes(next);
  }

  useEffect(() => {
    reload().catch(() => undefined);
  }, []);

  async function addTable(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    await api("/tables", {
      method: "POST",
      token,
      json: { tableNumber: Number(number), label: label || undefined },
    });
    setLabel("");
    await reload();
  }

  return (
    <AppShell>
      <div className="p-5 md:p-8">
        <h1 className="text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
          Tables & QR
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--ink-soft)]">
          Print these. Tape one per table. Guests should never need an app store.
        </p>
        <form onSubmit={addTable} className="mt-6 flex flex-wrap gap-2">
          <input
            className="w-24 border border-[var(--rule)] px-2 py-2 text-sm"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <input
            className="border border-[var(--rule)] px-2 py-2 text-sm"
            placeholder="Label (Window, Patio)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button className="bg-[var(--ink)] px-4 py-2 text-sm text-[var(--ticket)]">Add table</button>
        </form>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((table) => (
            <article key={table.id} className="ticket-shadow bg-[var(--ticket)] p-4 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                {restaurant?.name}
              </p>
              <h2 className="mt-1 text-2xl" style={{ fontFamily: "var(--font-serif)" }}>
                Table {table.tableNumber}
                {table.label ? ` · ${table.label}` : ""}
              </h2>
              {codes[table.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={codes[table.id]} alt={`QR for table ${table.tableNumber}`} className="mx-auto mt-3" />
              ) : null}
              <a
                href={`/m/${restaurant?.slug}/${table.qrToken}`}
                className="mt-2 inline-block text-xs underline"
                target="_blank"
              >
                Open guest menu
              </a>
            </article>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
