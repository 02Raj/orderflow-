"use client";

import { AppShell } from "@/components/app-shell";
import { EmptyState, PageHeader } from "@/components/ui";
import { api, formatMoney } from "@/lib/api";
import { getToken } from "@/lib/session";
import { FormEvent, useEffect, useState } from "react";

interface RangeReport {
  from: string;
  to: string;
  currency: string;
  locale: string;
  taxLabel: string;
  orderCount: number;
  grossMinor: number;
  netMinor: number;
  taxMinor: number;
  averageTicketMinor: number;
  topItems: { name: string; quantity: number; amountMinor: number }[];
  cancelled: { count: number; amountMinor: number };
  byDay: { businessDate: string; orderCount: number; grossMinor: number }[];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [report, setReport] = useState<RangeReport | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(nextFrom = from, nextTo = to) {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const r = await api<RangeReport>(
        `/reports/range?from=${encodeURIComponent(nextFrom)}&to=${encodeURIComponent(nextTo)}`,
        { token },
      );
      setReport(r);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => setLoading(false));
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(e: FormEvent) {
    e.preventDefault();
    load().catch(() => undefined);
  }

  return (
    <AppShell>
      <div className="p-5 md:p-8">
        <PageHeader
          kicker="Close"
          title="Reports"
          copy="Pick a date range in the venue’s business calendar. Covers, take, tax, and what sold."
        />
        <form onSubmit={apply} className="mt-6 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            From
            <input className="field mt-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-sm">
            To
            <input className="field mt-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="btn btn-ink">Apply</button>
        </form>

        {loading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-24" />
            ))}
          </div>
        ) : !report || report.orderCount === 0 ? (
          <EmptyState
            title="Nothing in this range"
            copy="After service, this page is the close: covers, take, cancelled tickets, and what sold."
          />
        ) : (
          <>
            <p className="mt-6 text-sm text-[var(--ink-soft)]">
              {report.from} → {report.to}
            </p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-4">
              <Stat label="Tickets" value={String(report.orderCount)} />
              <Stat
                label="Take"
                value={formatMoney(report.grossMinor, report.currency, report.locale)}
              />
              <Stat
                label="Average ticket"
                value={formatMoney(report.averageTicketMinor, report.currency, report.locale)}
              />
              <Stat
                label={report.taxLabel}
                value={formatMoney(report.taxMinor, report.currency, report.locale)}
              />
            </dl>
            {report.byDay.length > 1 ? (
              <>
                <h2 className="display mt-10 text-xl">By day</h2>
                <ul className="mt-3 max-w-lg">
                  {report.byDay.map((day) => (
                    <li
                      key={day.businessDate}
                      className="flex justify-between border-b border-[var(--rule)] py-2 text-sm"
                    >
                      <span>
                        {day.businessDate} · {day.orderCount} tickets
                      </span>
                      <span>{formatMoney(day.grossMinor, report.currency, report.locale)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <h2 className="display mt-10 text-xl">What sold</h2>
            <ul className="mt-3 max-w-lg">
              {report.topItems.map((item) => (
                <li
                  key={item.name}
                  className="flex justify-between border-b border-[var(--rule)] py-2 text-sm"
                >
                  <span>
                    {item.quantity}× {item.name}
                  </span>
                  <span>{formatMoney(item.amountMinor, report.currency, report.locale)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-[var(--ink-soft)]">
              Cancelled: {report.cancelled.count} ·{" "}
              {formatMoney(report.cancelled.amountMinor, report.currency, report.locale)}
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <dt className="text-xs uppercase tracking-widest text-[var(--ink-soft)]">{label}</dt>
      <dd className="mt-1 text-2xl">{value}</dd>
    </div>
  );
}
