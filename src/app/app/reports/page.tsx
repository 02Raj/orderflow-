"use client";

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
  collectedMinor: number;
  paymentsByMethod: { method: string; netMinor: number; recordedMinor: number; reversedMinor: number }[];
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

function methodLabel(method: string) {
  return ({ cash: "Cash", card_terminal: "Card terminal", upi: "UPI" } as Record<string, string>)[method] ?? method;
}

function csvCell(value: string | number) {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadReportCsv(report: RangeReport) {
  const money = (minor: number) => formatMoney(minor, report.currency, report.locale);
  const rows: (string | number)[][] = [
    ["OrderNFlow Order and Payments Report"],
    ["Period", `${report.from} to ${report.to}`],
    ["Currency", report.currency],
    [],
    ["Summary", "Value"],
    ["Tickets", report.orderCount],
    ["Order value", money(report.grossMinor)],
    ["Recorded payments", money(report.collectedMinor)],
    ["Net", money(report.netMinor)],
    [report.taxLabel, money(report.taxMinor)],
    ["Average Ticket", money(report.averageTicketMinor)],
    ["Cancelled Tickets", report.cancelled.count],
    ["Cancelled Amount", money(report.cancelled.amountMinor)],
    [],
    ["Payment method", "Recorded", "Reversed", "Net"],
    ...report.paymentsByMethod.map((entry) => [methodLabel(entry.method), money(entry.recordedMinor), money(entry.reversedMinor), money(entry.netMinor)]),
    [],
    ["By Day", "Tickets", "Order value"],
    ...report.byDay.map((d) => [d.businessDate, d.orderCount, money(d.grossMinor)]),
    [],
    ["Top Selling Items", "Quantity", "Amount"],
    ...report.topItems.map((i) => [i.name, i.quantity, money(i.amountMinor)]),
  ];

  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ordernflow-report-${report.from}-to-${report.to}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [report, setReport] = useState<RangeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState(() => ({ from: todayIso(), to: todayIso() }));

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    const query = new URLSearchParams(period);
    void api<RangeReport>(`/reports/range?${query}`, { token, signal: controller.signal })
      .then(setReport)
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load reports.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period]);

  function apply(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setPeriod({ from, to });
  }

  return (
    <div className="mx-auto max-w-7xl p-5 md:p-8">
        <PageHeader
          kicker="Close"
          title="Reports"
          copy="Compare order totals, cancelled tickets, and recorded payments by date."
        />
        <form onSubmit={apply} className="card mt-6 flex flex-wrap items-end justify-between gap-3 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
              From
              <input className="field mt-1 text-sm text-[var(--ink)]" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
              To
              <input className="field mt-1 text-sm text-[var(--ink)]" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button className="btn btn-ink min-h-11">Apply</button>
          </div>
          {!error && !loading && report && (report.orderCount > 0 || report.paymentsByMethod.length > 0) ? (
            <button
              type="button"
              onClick={() => downloadReportCsv(report)}
              className="btn btn-ghost min-h-11"
            >
              Export CSV ↓
            </button>
          ) : null}
        </form>

        {error ? <p role="alert" className="mt-5 text-sm text-[var(--chili-dark)]">{error}</p> : loading ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-24 rounded-2xl" />
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="skeleton h-64 rounded-2xl" />
              <div className="skeleton h-64 rounded-2xl" />
            </div>
          </div>
        ) : !report || (report.orderCount === 0 && report.paymentsByMethod.length === 0) ? (
          <EmptyState
            title="Nothing in this range"
            copy="Orders, cancelled tickets, and recorded payments appear here after service."
          />
        ) : (
          <>
            <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
              Showing {report.from} → {report.to}
            </p>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Tickets" value={String(report.orderCount)} />
              <Stat
                label="Order value"
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
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <section className="card p-5">
                <h2 className="display text-xl">What sold</h2>
                <ul className="mt-4 divide-y divide-[var(--rule)]">
                  {report.topItems.map((item) => (
                    <li
                      key={item.name}
                      className="flex items-center justify-between py-2.5 text-sm"
                    >
                      <span>
                        <strong className="mr-1.5">{item.quantity}×</strong>
                        {item.name}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {formatMoney(item.amountMinor, report.currency, report.locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card p-5">
                <h2 className="display text-xl">
                  {report.byDay.length > 1 ? "By day" : "Service breakdown"}
                </h2>
                {report.byDay.length > 1 ? (
                  <ul className="mt-4 divide-y divide-[var(--rule)]">
                    {report.byDay.map((day) => (
                      <li
                        key={day.businessDate}
                        className="flex items-center justify-between py-2.5 text-sm"
                      >
                        <span>
                          {day.businessDate} ·{" "}
                          <span className="text-[var(--ink-soft)]">{day.orderCount} tickets</span>
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatMoney(day.grossMinor, report.currency, report.locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <dl className="mt-4 divide-y divide-[var(--rule)] text-sm">
                    <div className="flex justify-between py-2.5">
                      <dt className="text-[var(--ink-soft)]">Order value before tax</dt>
                      <dd className="font-semibold tabular-nums">
                        {formatMoney(report.netMinor, report.currency, report.locale)}
                      </dd>
                    </div>
                    <div className="flex justify-between py-2.5">
                      <dt className="text-[var(--ink-soft)]">{report.taxLabel}</dt>
                      <dd className="font-semibold tabular-nums">
                        {formatMoney(report.taxMinor, report.currency, report.locale)}
                      </dd>
                    </div>
                    <div className="flex justify-between py-2.5">
                      <dt className="text-[var(--ink-soft)]">Order value including tax</dt>
                      <dd className="font-semibold tabular-nums">
                        {formatMoney(report.grossMinor, report.currency, report.locale)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--ink-soft)]">Recorded payments</dt>
                      <dd>{formatMoney(report.collectedMinor, report.currency, report.locale)}</dd>
                    </div>
                    {report.paymentsByMethod.map((entry) => (
                      <div key={entry.method} className="flex justify-between gap-2 py-2 text-sm">
                        <dt>{methodLabel(entry.method)}
                          {entry.reversedMinor > 0 && <small className="block text-[var(--ink-soft)]">
                            {formatMoney(entry.reversedMinor, report.currency, report.locale)} reversed
                          </small>}
                        </dt>
                        <dd>{formatMoney(entry.netMinor, report.currency, report.locale)}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between py-2.5">
                      <dt className="text-[var(--ink-soft)]">Cancelled ({report.cancelled.count})</dt>
                      <dd className="font-semibold tabular-nums text-[var(--chili-dark)]">
                        {formatMoney(report.cancelled.amountMinor, report.currency, report.locale)}
                      </dd>
                    </div>
                  </dl>
                )}
              </section>
            </div>
          </>
        )}
      </div>
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
