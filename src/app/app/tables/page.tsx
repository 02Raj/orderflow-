"use client";

import { AppShell } from "@/components/app-shell";
import { EmptyState, PageHeader } from "@/components/ui";
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
  const [loaded, setLoaded] = useState(false);

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
        color: { dark: "#1a1612", light: "#fffaf1" },
      });
    }
    setCodes(next);
    setLoaded(true);
  }

  useEffect(() => {
    reload().catch(() => setLoaded(true));
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
        <PageHeader
          kicker="Tables"
          title="Tables & QR"
          copy="Print one code per table. Guests open the menu on their phone — no app store."
        />
        <form onSubmit={addTable} className="mt-6 flex flex-wrap gap-2">
          <input
            className="field w-24"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <input
            className="field max-w-xs"
            placeholder="Label (Window, Patio)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button className="btn btn-ink">Add table</button>
        </form>
        {!loaded ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-64" />
            ))}
          </div>
        ) : tables.length === 0 ? (
          <EmptyState title="No tables" copy="Add table 1 and print the QR before the first cover." />
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((table) => (
              <article key={table.id} className="card p-4 text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                  {restaurant?.name}
                </p>
                <h2 className="display mt-1 text-2xl">
                  Table {table.tableNumber}
                  {table.label ? ` · ${table.label}` : ""}
                </h2>
                {codes[table.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={codes[table.id]}
                    alt={`QR for table ${table.tableNumber}`}
                    className="mx-auto mt-3"
                  />
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
        )}
      </div>
    </AppShell>
  );
}
