"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { saveSession, SessionUser } from "@/lib/session";
import { formatTaxRate, taxGuestHint } from "@/lib/tax";
import { SiteFooter } from "@/components/legal";
import { BrandLink } from "@/components/brand";
import { StepDots } from "@/components/ui";

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
  const [step, setStep] = useState(1);
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
      .catch(() =>
        setPresets([
          {
            countryCode: "US",
            label: "United States",
            currency: "USD",
            taxLabel: "Sales tax",
            taxRateBp: 854,
            taxInclusive: false,
          },
        ]),
      );
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

  function nextStep(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.fullName.trim() || !form.restaurantName.trim() || !form.email || form.password.length < 8) {
      setError("Fill in your name, restaurant, email, and an 8+ character password.");
      return;
    }
    setStep(2);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setError("Please accept the Terms to continue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api<{ token: string; user: SessionUser }>("/auth/signup", {
        method: "POST",
        json: { ...form, taxRegion: form.taxRegion || undefined },
      });
      saveSession(res.token, res.user);
      window.location.assign("/app/menu?setup=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create venue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <BrandLink />
      <div className="mt-8 flex items-center justify-between">
        <h1 className="display text-4xl">{step === 1 ? "Open your floor" : "Where do you operate?"}</h1>
        <StepDots step={step} total={2} />
      </div>
      <p className="mt-2 text-sm text-[var(--ink-soft)]">
        {step === 1
          ? "Two short steps. Tables and QR codes are created for you."
          : "This sets currency and tax. You can change it later in Settings."}
      </p>

      {step === 1 ? (
        <form onSubmit={nextStep} className="card mt-8 grid gap-4 p-5">
          <label className="text-sm font-medium">
            Your name
            <input
              className="field mt-1.5"
              required
              autoComplete="name"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </label>
          <label className="text-sm font-medium">
            Restaurant name
            <input
              className="field mt-1.5"
              required
              value={form.restaurantName}
              onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
            />
          </label>
          <label className="text-sm font-medium">
            Email
            <input
              type="email"
              className="field mt-1.5"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="text-sm font-medium">
            Password
            <input
              type="password"
              minLength={8}
              className="field mt-1.5"
              required
              autoComplete="new-password"
              placeholder="8+ characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          {error ? <p className="text-sm text-[var(--chili)]">{error}</p> : null}
          <button className="btn btn-chili py-3">Continue</button>
        </form>
      ) : (
        <form onSubmit={onSubmit} className="card mt-8 grid gap-4 p-5">
          <label className="text-sm font-medium">
            Country
            <select
              className="field mt-1.5"
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
            <label className="text-sm font-medium">
              {preset?.regionLabel ?? "Region"}
              <select
                className="field mt-1.5"
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
          {hint ? <p className="text-xs leading-5 text-[var(--ink-soft)]">{hint}</p> : null}
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
              <Link href="/terms" className="text-[var(--chili)]">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-[var(--chili)]">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost flex-1 py-3" onClick={() => setStep(1)}>
              Back
            </button>
            <button disabled={busy || !agreed} className="btn btn-chili flex-[1.4] py-3">
              {busy ? "Opening…" : "Start free trial"}
            </button>
          </div>
        </form>
      )}

      <p className="mt-6 text-sm text-[var(--ink-soft)]">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
      <div className="mt-12">
        <SiteFooter />
      </div>
    </main>
  );
}
