"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { saveSession, SessionUser } from "@/lib/session";
import { formatTaxRate, taxGuestHint } from "@/lib/tax";
import { SiteFooter } from "@/components/legal";

interface TaxRegion {
  code: string;
  label: string;
  taxRateBp: number;
}

interface Preset {
  countryCode: string;
  label: string;
  currency: string;
  taxLabel: string;
  taxRateBp: number;
  taxInclusive: boolean;
  regionLabel?: string;
  regions?: TaxRegion[];
}

export default function SignupPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    restaurantName: "",
    countryCode: "US",
    taxRegion: "NYC",
  });
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    api<Preset[]>("/auth/country-presets")
      .then(setPresets)
      .catch(() => setPresets([{ countryCode: "US", label: "United States", currency: "USD", taxLabel: "Sales tax", taxRateBp: 854, taxInclusive: false }]));
  }, []);

  const preset = presets.find((p) => p.countryCode === form.countryCode);
  const regions = preset?.regions ?? [];

  const hint = useMemo(() => {
    if (!preset) return "";
    const region = regions.find((r) => r.code === form.taxRegion);
    const rate = region?.taxRateBp ?? preset.taxRateBp;
    return taxGuestHint(preset.taxInclusive, preset.taxLabel, rate);
  }, [preset, regions, form.taxRegion]);

  function onCountry(countryCode: string) {
    const next = presets.find((p) => p.countryCode === countryCode);
    const firstRegion = next?.regions?.[0]?.code ?? "";
    setForm({ ...form, countryCode, taxRegion: firstRegion });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setError("Accept the Terms and Privacy Policy to open a venue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api<{ token: string; user: SessionUser }>("/auth/signup", {
        method: "POST",
        json: {
          ...form,
          taxRegion: form.taxRegion || undefined,
        },
      });
      saveSession(res.token, res.user);
      window.location.assign("/app/menu");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create venue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
      <Link href="/" className="text-sm text-[var(--ink-soft)]">
        ← OrderFlow
      </Link>
      <h1 className="display mt-4 text-4xl">Open your floor</h1>
      <p className="mt-2 text-sm text-[var(--ink-soft)]">
        Creates the venue, eight tables, and QR tokens. Tax follows the country — US adds sales tax
        at the till; UK, EU, Gulf and India bake VAT/GST into the menu price.
      </p>
      <form onSubmit={onSubmit} method="post" action="/app/menu" className="card mt-8 grid gap-4 p-5">
        <label className="text-sm">
          Your name
          <input
            className="field mt-1"
            required
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Restaurant name
          <input
            className="field mt-1"
            required
            value={form.restaurantName}
            onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Country
          <select
            className="field mt-1"
            value={form.countryCode}
            onChange={(e) => onCountry(e.target.value)}
          >
            {presets.map((p) => (
              <option key={p.countryCode} value={p.countryCode}>
                {p.label} · {p.currency}
              </option>
            ))}
          </select>
        </label>
        {regions.length ? (
          <label className="text-sm">
            {preset?.regionLabel ?? "Region"}
            <select
              className="field mt-1"
              value={form.taxRegion}
              onChange={(e) => setForm({ ...form, taxRegion: e.target.value })}
            >
              {regions.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label} · {formatTaxRate(r.taxRateBp)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {hint ? <p className="text-xs text-[var(--ink-soft)]">{hint}</p> : null}
        <label className="text-sm">
          Email
          <input
            type="email"
            className="field mt-1"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Password (8+ characters)
          <input
            type="password"
            minLength={8}
            className="field mt-1"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        {error ? <p className="text-sm text-[var(--chili)]">{error}</p> : null}
        <label className="flex items-start gap-2 text-xs leading-5 text-[var(--ink-soft)]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            required
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>
            ,{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            , and{" "}
            <Link href="/dpa" className="underline">
              DPA
            </Link>
            . OrderFlow does not take guest cards and does not sell venue data.
          </span>
        </label>
        <button disabled={busy || !agreed} className="btn btn-chili py-3">
          {busy ? "Opening…" : "Start free trial"}
        </button>
      </form>
      <div className="mt-10">
        <SiteFooter />
      </div>
    </main>
  );
}
