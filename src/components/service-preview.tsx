"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const stages = [
  { status: "Waiting for order", badge: "Idle", timer: "0:00", action: "Send sample order", tone: "bg-[var(--paper-2)] text-[var(--ink)]" },
  { status: "New ticket · Table 4", badge: "New", timer: "0:04", action: "Accept ticket", tone: "bg-[#f3d0c8] text-[var(--chili-dark)]" },
  { status: "Firing in kitchen", badge: "Firing", timer: "2:18", action: "Mark ready", tone: "bg-[#f3e3b6] text-[var(--ink)]" },
  { status: "Ready on the pass", badge: "Pass", timer: "4:45", action: "Reset preview", tone: "bg-[#cfe3d6] text-[var(--sage)]" },
];

export function ServicePreview() {
  const [stage, setStage] = useState(1);
  const [qrUrl, setQrUrl] = useState<string>("");
  const { status, badge, timer, action, tone } = stages[stage];

  useEffect(() => {
    const demoUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "https://ordernflow.com/login";
    QRCode.toDataURL(demoUrl, {
      margin: 1,
      width: 140,
      color: { dark: "#1a1612", light: "#fffaf1" },
    })
      .then(setQrUrl)
      .catch(() => undefined);
  }, []);

  return (
    <section
      id="service-preview"
      aria-labelledby="preview-heading"
      className="ticket-shadow min-w-0 scroll-mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[#3a3129] bg-[var(--board)] p-4 text-[var(--ticket)] sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#3a3129] pb-4">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#4ade80]" aria-hidden />
          <h2 id="preview-heading" className="display text-xl sm:text-2xl">
            Live QR-to-Kitchen flow
          </h2>
        </div>
        <span className="rounded-full border border-[#51453b] bg-[#211b16] px-3 py-1 text-xs font-medium text-[#e4d7c5]">
          Table 4 · {timer}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col justify-between rounded-xl border border-[#3a3129] bg-[#211b16] p-4">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#c9b89a]">1. Guest scans QR</p>
              <span className="text-[11px] text-[#e4d7c5]">No app</span>
            </div>
            <dl className="mt-3 grid gap-2.5 text-sm">
              <div className="rounded-lg bg-[#17130f] p-2.5">
                <dt className="font-semibold">1 × Grilled halloumi</dt>
                <dd className="text-xs text-[#c9b89a]">Dressing on the side</dd>
              </div>
              <div className="rounded-lg bg-[#17130f] p-2.5">
                <dt className="font-semibold">2 × Lemon sodas</dt>
                <dd className="text-xs text-[#c9b89a]">One without ice</dd>
              </div>
            </dl>
          </div>
          {qrUrl ? (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#3a3129] bg-[#17130f] p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="Sample table QR code" className="h-12 w-12 rounded bg-[var(--ticket)] p-0.5" />
              <div className="text-xs leading-snug text-[#e4d7c5]">
                <p className="font-semibold text-[var(--ticket)]">Scan to try demo</p>
                <p className="text-[#c9b89a]">Works on any phone browser</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col justify-between rounded-xl bg-[var(--ticket)] p-4 text-[var(--ink)]">
          <div>
            <div className="flex items-center justify-between border-b border-dashed border-[var(--rule)] pb-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                2. Kitchen screen
              </p>
              <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${tone}`}>{badge}</span>
            </div>

            <div role="status" className="mt-3">
              <p className="text-sm font-semibold">{status}</p>
              {stage > 0 ? (
                <ul className="mt-3 space-y-2 text-sm">
                  <li className="flex items-start justify-between border-b border-[var(--rule)]/60 pb-2">
                    <span>
                      <strong>1×</strong> Grilled halloumi
                      <em className="block text-xs not-italic text-[var(--chili-dark)]">Note: Dressing on side</em>
                    </span>
                    <span className="text-xs font-semibold text-[var(--ink-soft)]">{stage >= 3 ? "Done" : "Prep"}</span>
                  </li>
                  <li className="flex items-start justify-between">
                    <span>
                      <strong>2×</strong> Lemon sodas
                      <em className="block text-xs not-italic text-[var(--chili-dark)]">Note: One without ice</em>
                    </span>
                    <span className="text-xs font-semibold text-[var(--ink-soft)]">{stage >= 3 ? "Done" : "Prep"}</span>
                  </li>
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[var(--ink-soft)]">
                  Tap below to fire a sample guest order and watch how kitchen staff clear it.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wider">
            <span className={`rounded-lg px-2 py-1.5 ${stage === 1 ? "bg-[#f3d0c8] text-[var(--chili-dark)] ring-1 ring-[var(--chili)]" : "bg-[var(--paper)] text-[var(--ink-soft)]"}`}>
              New
            </span>
            <span className={`rounded-lg px-2 py-1.5 ${stage === 2 ? "bg-[#f3e3b6] text-[var(--ink)] ring-1 ring-[var(--amber)]" : "bg-[var(--paper)] text-[var(--ink-soft)]"}`}>
              Firing
            </span>
            <span className={`rounded-lg px-2 py-1.5 ${stage === 3 ? "bg-[#cfe3d6] text-[var(--sage)] ring-1 ring-[var(--sage)]" : "bg-[var(--paper)] text-[var(--ink-soft)]"}`}>
              Pass
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="btn btn-chili min-h-11"
          onClick={() => setStage((current) => (current + 1) % stages.length)}
        >
          {action} →
        </button>
        <span className="text-xs text-[#c9b89a]">Interactive preview · zero setup required</span>
      </div>
    </section>
  );
}
