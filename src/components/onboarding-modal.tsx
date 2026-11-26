"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getToken } from "@/lib/session";
import type { Restaurant } from "@/lib/types";

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [targetMinutes, setTargetMinutes] = useState(5);
  const [forgottenMinutes, setForgottenMinutes] = useState(15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const token = getToken();
    if (params.get("welcome") !== "1" || !token) return;
    const controller = new AbortController();
    void api<Restaurant>("/restaurant", { token, signal: controller.signal }).then((venue) => {
      if (venue.kitchenTargetMinutes == null) setOpen(true);
    }).catch(() => { if (!controller.signal.aborted) setOpen(true); });
    return () => controller.abort();
  }, []);

  if (!open) return null;

  async function finish() {
    const token = getToken();
    if (!token || saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/restaurant/kitchen-targets", { method: "PATCH", token, json: { targetMinutes, forgottenMinutes } });
      dismiss();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save kitchen targets.");
    } finally {
      setSaving(false);
    }
  }

  function dismiss() {
    setOpen(false);
    if (window.location.search.includes("welcome=1")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  const closePct = Math.min(85, Math.max(20, (targetMinutes / forgottenMinutes) * 100));
  const warnPct = Math.min(92, closePct + 14);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-targets-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-xs"
    >
      <div className="ticket-shadow grid w-full max-w-3xl overflow-hidden rounded-[var(--radius-lg)] bg-[var(--ticket)] md:grid-cols-[240px_1fr]">
        <aside className="flex flex-col justify-between bg-[var(--sage)] p-6 text-[var(--ticket)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#cfe3d6]">
              Set your targets · 1 min
            </p>
            <h2 id="onboarding-targets-title" className="display mt-3 text-2xl leading-tight">
              First, tell OrderNFlow what on-time means in your kitchen.
            </h2>
            <p className="mt-3 text-xs leading-relaxed text-[#e4efe8]">
              Kitchen tickets shift color automatically as they approach your target time.
            </p>
          </div>

          <ol className="mt-8 space-y-3 text-sm">
            {[
              [1, "Target time"],
              [2, "Forgotten alert"],
              [3, "Review targets"],
            ].map(([num, label]) => {
              const n = num as 1 | 2 | 3;
              const active = step === n;
              const done = step > n;
              return (
                <li key={n} className={`flex items-center gap-2.5 ${active ? "font-semibold text-white" : "text-[#cfe3d6]"}`}>
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${
                      done
                        ? "bg-white text-[var(--sage)]"
                        : active
                          ? "border-2 border-white text-white"
                          : "border border-[#7aa392] text-[#cfe3d6]"
                    }`}
                  >
                    {done ? "✓" : n}
                  </span>
                  <span>{label}</span>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="flex flex-col justify-between p-6 sm:p-8">
          {step === 1 ? (
            <div>
              <h3 className="display text-2xl text-[var(--ink)]">
                What&apos;s your target time for table orders?
              </h3>
              <p className="mt-1.5 text-sm text-[var(--ink-soft)]">
                Minutes from when a guest order lands on your screen to when it&apos;s ready on the pass.
              </p>

              <div className="mt-6 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setTargetMinutes((m) => Math.max(2, m - 1))}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--rule)] bg-white text-lg font-bold hover:border-[var(--ink)]"
                >
                  −
                </button>
                <div className="min-w-28 rounded-xl border border-[var(--rule)] bg-white px-5 py-2.5 text-center">
                  <strong className="text-xl">{targetMinutes}</strong>{" "}
                  <span className="text-sm text-[var(--ink-soft)]">min</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTargetMinutes((m) => Math.min(forgottenMinutes - 2, m + 1))}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--rule)] bg-white text-lg font-bold hover:border-[var(--ink)]"
                >
                  +
                </button>
              </div>

              <div className="mt-7 rounded-xl border border-[var(--rule)] bg-white p-4">
                <div className="flex justify-between text-xs text-[var(--ink-soft)]">
                  <span>In-store ticket timeline</span>
                  <span>min after arrival</span>
                </div>
                <div className="mt-2.5 flex h-7 overflow-hidden rounded-lg text-[11px] font-semibold">
                  <div
                    style={{ width: `${closePct}%` }}
                    className="flex items-center justify-center bg-[#cfe3d6] text-[var(--sage)]"
                  >
                    On time ({targetMinutes}m)
                  </div>
                  <div
                    style={{ width: `${warnPct - closePct}%` }}
                    className="flex items-center justify-center bg-[#f3e3b6] text-[var(--ink)]"
                  >
                    Close
                  </div>
                  <div
                    style={{ width: `${100 - warnPct}%` }}
                    className="flex items-center justify-center bg-[#f3d0c8] text-[var(--chili-dark)]"
                  >
                    Late
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <h3 className="display text-2xl text-[var(--ink)]">
                When is an order most likely forgotten?
              </h3>
              <p className="mt-1.5 text-sm text-[var(--ink-soft)]">
                Orders still open after this time are highlighted as urgent so nothing slips through.
              </p>

              <div className="mt-6 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setForgottenMinutes((m) => Math.max(targetMinutes + 3, m - 1))}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--rule)] bg-white text-lg font-bold hover:border-[var(--ink)]"
                >
                  −
                </button>
                <div className="min-w-28 rounded-xl border border-[var(--rule)] bg-white px-5 py-2.5 text-center">
                  <strong className="text-xl">{forgottenMinutes}</strong>{" "}
                  <span className="text-sm text-[var(--ink-soft)]">min</span>
                </div>
                <button
                  type="button"
                  onClick={() => setForgottenMinutes((m) => Math.min(45, m + 1))}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--rule)] bg-white text-lg font-bold hover:border-[var(--ink)]"
                >
                  +
                </button>
              </div>

              <div className="mt-7 rounded-xl border border-[var(--rule)] bg-white p-4">
                <div className="flex justify-between text-xs text-[var(--ink-soft)]">
                  <span>Alert threshold</span>
                  <span>{forgottenMinutes}+ min</span>
                </div>
                <div className="mt-2.5 flex h-7 overflow-hidden rounded-lg text-[11px] font-semibold">
                  <div
                    style={{ width: `${closePct}%` }}
                    className="flex items-center justify-center bg-[#cfe3d6] text-[var(--sage)]"
                  >
                    On time
                  </div>
                  <div
                    style={{ width: `${warnPct - closePct}%` }}
                    className="flex items-center justify-center bg-[#f3e3b6] text-[var(--ink)]"
                  >
                    Close
                  </div>
                  <div className="flex flex-1 items-center justify-center bg-[#f3d0c8] text-[var(--chili-dark)]">
                    Urgent ({forgottenMinutes}m+)
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <h3 className="display text-2xl text-[var(--ink)]">
                Nice work. Your targets are set.
              </h3>
              <p className="mt-1.5 text-sm text-[var(--ink-soft)]">
                Your live floor &amp; kitchen boards are ready. You can adjust these anytime.
              </p>

              <dl className="mt-6 divide-y divide-[var(--rule)] rounded-xl border border-[var(--rule)] bg-white px-4">
                <div className="flex items-center justify-between py-3 text-sm">
                  <dt className="flex items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--sage)]" />
                    On-time target
                  </dt>
                  <dd className="font-semibold">Up to {targetMinutes} min</dd>
                </div>
                <div className="flex items-center justify-between py-3 text-sm">
                  <dt className="flex items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
                    Close warning
                  </dt>
                  <dd className="font-semibold">
                    {targetMinutes} to {targetMinutes + 3} min
                  </dd>
                </div>
                <div className="flex items-center justify-between py-3 text-sm">
                  <dt className="flex items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--chili)]" />
                    Forgotten alert
                  </dt>
                  <dd className="font-semibold">After {forgottenMinutes} min</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {error && <p role="alert" className="mt-3 text-sm text-[var(--chili-dark)]">{error}</p>}
          <div className="mt-8 flex items-center justify-between border-t border-[var(--rule)] pt-4">
            <button type="button" disabled={saving} onClick={dismiss} className="text-xs font-medium text-[var(--ink-soft)] hover:underline">
              Remind me later
            </button>
            <div className="flex items-center gap-2">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                  className="btn btn-ghost"
                >
                  ← Back
                </button>
              ) : null}
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s === 1 ? 2 : 3))}
                  className="btn bg-[var(--sage)] text-white"
                >
                  Next →
                </button>
              ) : (
                <button type="button" disabled={saving} onClick={finish} className="btn bg-[var(--sage)] text-white">
                  {saving ? "Saving…" : "Done"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
