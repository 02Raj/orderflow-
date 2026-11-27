"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const TOUR_DONE_KEY = "ordernflow:demo_tour_done";
const subscribe = () => () => {};
const getServerTour = () => false;

const STEPS = [
  {
    step: 1,
    badge: "Step 1 of 4 · Floor",
    title: "Welcome to Harbour & Rye",
    description:
      "This is your live Floor dashboard. Every guest QR order and waiter ticket appears here with a running timer so nothing gets missed during rush hour.",
    tip: "Pre-loaded with 8 tables, a full British bistro menu, modifiers, and UK VAT presets.",
    href: "/app",
    actionLabel: "View Floor",
  },
  {
    step: 2,
    badge: "Step 2 of 4 · Guest QR",
    title: "Table QR codes — zero app needed",
    description:
      "Every table has a scannable QR code. Guests open the menu in their phone browser, pick modifiers or allergy notes, and send orders straight to your kitchen.",
    tip: "You can preview any table's guest menu directly from the Tables & QR page.",
    href: "/app/tables",
    actionLabel: "Open Tables & QR",
  },
  {
    step: 3,
    badge: "Step 3 of 4 · Kitchen & Staff",
    title: "Live Kitchen Display & Waiter Mode",
    description:
      "Chefs see incoming tickets on the Kitchen screen (New → Firing → Pass), while floor staff can also ring up orders on any phone from Take Order.",
    tip: "Try placing a test order in Take Order and watching it appear in Tickets & Kitchen.",
    href: "/app/take-order",
    actionLabel: "Try Take Order",
  },
  {
    step: 4,
    badge: "Step 4 of 4 · Close & Reports",
    title: "Reports, Staff & Local Tax",
    description:
      "Review daily covers, top-selling dishes, and VAT/GST summaries in Reports, or add dedicated logins for your kitchen and floor team in Staff.",
    tip: "Ready to launch your own venue? Sign out anytime and click Start for free.",
    href: "/app/reports",
    actionLabel: "View Reports",
  },
];

export function DemoTourModal({
  userEmail,
  externalOpen,
  onExternalClose,
}: {
  userEmail?: string;
  externalOpen?: boolean;
  onExternalClose?: () => void;
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [idx, setIdx] = useState(0);

  const autoOpen = useSyncExternalStore(subscribe, () => {
    const params = new URLSearchParams(window.location.search);
    const isDemoUser = userEmail?.endsWith("@harbourandrye.demo");
    const done = window.localStorage.getItem(TOUR_DONE_KEY);
    return Boolean((params.get("demo") === "1" || isDemoUser) && !done);
  }, getServerTour);

  if (!externalOpen && (!autoOpen || dismissed)) return null;

  const current = STEPS[idx];
  const isLast = idx === STEPS.length - 1;

  function closeTour() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TOUR_DONE_KEY, "1");
      if (window.location.search.includes("demo=1")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
    setDismissed(true);
    setIdx(0);
    onExternalClose?.();
  }

  function goToPageAndNext() {
    router.push(current.href);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-tour-title"
      className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-md sm:bottom-6 sm:right-6"
    >
      <div className="ticket-shadow overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--ticket)] text-[var(--ink)]">
        {/* Progress strip */}
        <div className="h-1.5 w-full bg-[var(--paper-2)]">
          <div
            className="h-full bg-[var(--chili)] transition-all duration-300"
            style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-[#f3d0c8] px-2.5 py-0.5 text-[11px] font-bold text-[var(--chili-dark)]">
              {current.badge}
            </span>
            <button
              type="button"
              onClick={closeTour}
              className="text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--ink)] hover:underline"
            >
              Skip tour
            </button>
          </div>

          <h2 id="demo-tour-title" className="display mt-3 text-2xl leading-tight">
            {current.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{current.description}</p>

          <p className="mt-3 rounded-xl border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-xs text-[var(--ink-soft)]">
            <strong className="text-[var(--ink)]">Tip:</strong> {current.tip}
          </p>

          {/* Step dots */}
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--rule)] pt-4">
            <button
              type="button"
              onClick={goToPageAndNext}
              className="text-xs font-semibold text-[var(--chili-dark)] underline hover:text-[var(--chili)]"
            >
              {current.actionLabel} ↗
            </button>

            <div className="flex items-center gap-2">
              {idx > 0 ? (
                <button
                  type="button"
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  className="btn btn-ghost min-h-9 px-3 py-1.5 text-xs"
                >
                  Back
                </button>
              ) : null}
              {!isLast ? (
                <button
                  type="button"
                  onClick={() => {
                    const nextIdx = idx + 1;
                    setIdx(nextIdx);
                    router.push(STEPS[nextIdx].href);
                  }}
                  className="btn btn-chili min-h-9 px-4 py-1.5 text-xs"
                >
                  Next step →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={closeTour}
                  className="btn bg-[var(--sage)] min-h-9 px-4 py-1.5 text-xs text-white"
                >
                  Finish tour ✓
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
