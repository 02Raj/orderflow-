"use client";

import { AppShell } from "@/components/app-shell";
import { api, formatMoney } from "@/lib/api";
import { getToken } from "@/lib/session";
import { useEffect, useState } from "react";

interface DayReport {
  businessDate: string;
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
  byStatus: { status: string; count: number }[];
}

export default function ReportsPage() {
  const [report, setReport] = useState<DayReport | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    api<DayReport>("/reports/day", { token })
      .then((r) => {
        setReport(r);
        setEmpty(r.orderCount === 0);
      })
      .catch(() => setEmpty(true));
  }, []);

  return (
    <AppShell>
      <div className="p-5 md:p-8">
        <h1 className="text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
          End of day
        </h1>
        {!report || empty ? (
          <p className="mt-6 max-w-lg text-sm text-[var(--ink-soft)]">
            No tickets on this business date yet. After service, this page is the close: covers,
            take, cancelled tickets, and what sold.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">{report.businessDate}</p>
            <dl className="mt-8 grid gap-4 sm:grid-cols-4">
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
                label={`${report.taxLabel}`}
                value={formatMoney(report.taxMinor, report.currency, report.locale)}
              />
            </dl>
            <h2 className="mt-10 text-xl" style={{ fontFamily: "var(--font-serif)" }}>
              What sold
            </h2>
            <ul className="mt-3 max-w-lg">
              {report.topItems.map((item) => (
                <li key={item.name} className="flex justify-between border-b border-[var(--rule)] py-2 text-sm">
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
    <div className="border border-[var(--rule)] bg-[var(--ticket)] p-4">
      <dt className="text-xs uppercase tracking-widest text-[var(--ink-soft)]">{label}</dt>
      <dd className="mt-1 text-2xl">{value}</dd>
    </div>
  );
}
