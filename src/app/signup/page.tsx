"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { saveSession, SessionUser } from "@/lib/session";
import { taxGuestHint } from "@/lib/tax";
import { BrandLink } from "@/components/brand";

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

const KITCHEN_TYPES = [
  "Casual dining",
  "Cafe or coffee",
  "Fast casual",
  "Food truck",
  "Brewery",
  "Quick service",
  "Family dining",
  "Something else",
];

const GOALS = [
  { id: "Speed", title: "Speed", desc: "Get orders out the window faster" },
  { id: "Efficiency", title: "Efficiency", desc: "Less wasted motion on the line" },
  { id: "Accuracy", title: "Accuracy", desc: "Fewer remakes, fewer comps" },
  { id: "Communication", title: "Communication", desc: "Front and back of house on the same page" },
];

const CURRENT_SETUPS = [
  { id: "paper", code: "PT", label: "Paper tickets & verbal" },
  { id: "fresh", code: "NF", label: "Starting fresh / New venue" },
  { id: "square", code: "SQ", label: "Square" },
  { id: "toast", code: "TS", label: "Toast" },
  { id: "clover", code: "CL", label: "Clover" },
  { id: "lightspeed", code: "LS", label: "Lightspeed" },
  { id: "petpooja", code: "PP", label: "Petpooja" },
  { id: "other", code: "OT", label: "Other POS / Register" },
];

export default function SignupPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [kitchenType, setKitchenType] = useState("Cafe or coffee");
  const [goal, setGoal] = useState("Speed");
  const [currentSetup, setCurrentSetup] = useState("paper");
  const [setupSearch, setSetupSearch] = useState("");
  const [city, setCity] = useState("");

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    restaurantName: "",
    countryCode: "US",
    taxRegion: "NYC",
  });
  const [agreed, setAgreed] = useState(true);

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
          {
            countryCode: "GB",
            label: "United Kingdom",
            currency: "GBP",
            taxLabel: "VAT",
            taxRateBp: 2000,
            taxInclusive: true,
          },
          {
            countryCode: "IN",
            label: "India",
            currency: "INR",
            taxLabel: "GST",
            taxRateBp: 500,
            taxInclusive: true,
          },
          {
            countryCode: "AE",
            label: "United Arab Emirates",
            currency: "AED",
            taxLabel: "VAT",
            taxRateBp: 500,
            taxInclusive: true,
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

  const filteredSetups = useMemo(() => {
    const q = setupSearch.trim().toLowerCase();
    if (!q) return CURRENT_SETUPS;
    return CURRENT_SETUPS.filter((s) => s.label.toLowerCase().includes(q));
  }, [setupSearch]);

  function onCountry(countryCode: string) {
    const next = presets.find((p) => p.countryCode === countryCode);
    const firstRegion = next?.regions?.[0]?.code ?? "";
    setForm({ ...form, countryCode, taxRegion: firstRegion });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
    if (!fullName || !form.restaurantName.trim() || !form.email.trim() || form.password.length < 8) {
      setError("Fill in your business name, full name, email, and an 8+ character password.");
      return;
    }
    if (!agreed) {
      setError("Please accept the Terms of Service and Privacy Policy to continue.");
      return;
    }

    setBusy(true);
    try {
      const res = await api<{ token: string; user: SessionUser }>("/auth/signup", {
        method: "POST",
        json: {
          fullName,
          email: form.email.trim(),
          password: form.password,
          restaurantName: form.restaurantName.trim(),
          countryCode: form.countryCode,
          taxRegion: form.taxRegion || undefined,
        },
      });
      saveSession(res.token, res.user);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "ordernflow:onboarding",
          JSON.stringify({ kitchenType, goal, currentSetup, city }),
        );
      }
      window.location.assign("/app?welcome=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create venue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[var(--chili)] via-[var(--chili-dark)] to-[#5f1912] px-4 py-10 text-[var(--ink)]">
      {/* Subtle floating ticket pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grid grid-cols-4 gap-6 opacity-10 sm:grid-cols-6"
      >
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-2xl border border-white/40 bg-white/10 p-3 -rotate-3"
          >
            <div className="h-2.5 w-12 rounded bg-white/40" />
            <div className="mt-3 h-2 w-full rounded bg-white/30" />
            <div className="mt-2 h-2 w-3/4 rounded bg-white/30" />
          </div>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-[460px]">
        <h1 className="display text-center text-3xl font-bold leading-tight text-white sm:text-4xl">
          Five quick questions.
          <br />
          Then it&apos;s order up.
        </h1>

        <div className="ticket-shadow mt-6 overflow-hidden rounded-2xl bg-[var(--ticket)]">
          {/* Progress bar */}
          <div className="h-1.5 w-full bg-[var(--paper-2)]">
            <div
              className="h-full bg-[var(--sage)] transition-all duration-300"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>

          <div className="p-6 sm:p-7">
            {/* Card header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {step > 1 ? (
                  <button
                    type="button"
                    aria-label="Previous step"
                    onClick={() => {
                      setError("");
                      setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4 | 5) : 1));
                    }}
                    className="grid h-7 w-7 place-items-center rounded-lg text-[var(--ink-soft)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
                  >
                    ←
                  </button>
                ) : null}
                <BrandLink />
              </div>
              <span className="text-xs font-medium text-[var(--ink-soft)]">{step} of 5</span>
            </div>

            {/* Step 1: Kitchen type */}
            {step === 1 ? (
              <div className="mt-6">
                <h2 className="text-lg font-semibold">What kind of kitchen are you running?</h2>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  This tunes your starting setup. Everything&apos;s changeable later.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  {KITCHEN_TYPES.map((type) => {
                    const selected = kitchenType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setKitchenType(type)}
                        className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-xs font-medium transition sm:text-sm ${
                          selected
                            ? "border-[var(--sage)] bg-[#cfe3d6]/45 text-[var(--ink)] ring-1 ring-[var(--sage)]"
                            : "border-[var(--rule)] bg-white text-[var(--ink)] hover:border-[var(--ink-soft)]"
                        }`}
                      >
                        <span
                          className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                            selected ? "border-[var(--sage)]" : "border-[var(--rule)]"
                          }`}
                        >
                          {selected ? <span className="h-2 w-2 rounded-full bg-[var(--sage)]" /> : null}
                        </span>
                        <span className="truncate">{type}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="btn mt-6 w-full bg-[var(--sage)] py-3 text-white hover:opacity-95"
                >
                  Continue
                </button>
              </div>
            ) : null}

            {/* Step 2: Primary goal */}
            {step === 2 ? (
              <div className="mt-6">
                <h2 className="text-lg font-semibold">What matters most right now?</h2>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  Pick one. It sets what your dashboard leads with.
                </p>

                <div className="mt-4 grid gap-2.5">
                  {GOALS.map((g) => {
                    const selected = goal === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGoal(g.id)}
                        className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                          selected
                            ? "border-[var(--sage)] bg-[#cfe3d6]/45 ring-1 ring-[var(--sage)]"
                            : "border-[var(--rule)] bg-white hover:border-[var(--ink-soft)]"
                        }`}
                      >
                        <span
                          className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                            selected ? "border-[var(--sage)]" : "border-[var(--rule)]"
                          }`}
                        >
                          {selected ? <span className="h-2 w-2 rounded-full bg-[var(--sage)]" /> : null}
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{g.title}</p>
                          <p className="text-xs text-[var(--ink-soft)]">{g.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="btn mt-6 w-full bg-[var(--sage)] py-3 text-white hover:opacity-95"
                >
                  Continue
                </button>
              </div>
            ) : null}

            {/* Step 3: Current setup */}
            {step === 3 ? (
              <div className="mt-6">
                <h2 className="text-lg font-semibold">How do you ring up orders today?</h2>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  OrderNFlow runs alongside your existing setup — no hardware swap needed.
                </p>

                <input
                  type="search"
                  placeholder="Search, like &quot;Square&quot; or &quot;Paper&quot;"
                  value={setupSearch}
                  onChange={(e) => setSetupSearch(e.target.value)}
                  className="field mt-4 text-sm"
                />

                <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1">
                  {filteredSetups.map((item) => {
                    const selected = currentSetup === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setCurrentSetup(item.id)}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                          selected
                            ? "border-[var(--sage)] bg-[#cfe3d6]/45 ring-1 ring-[var(--sage)]"
                            : "border-[var(--rule)] bg-white hover:border-[var(--ink-soft)]"
                        }`}
                      >
                        <span
                          className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                            selected ? "border-[var(--sage)]" : "border-[var(--rule)]"
                          }`}
                        >
                          {selected ? <span className="h-2 w-2 rounded-full bg-[var(--sage)]" /> : null}
                        </span>
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--paper-2)] text-[10px] font-bold text-[var(--ink-soft)]">
                          {item.code}
                        </span>
                        <span className="font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="btn mt-6 w-full bg-[var(--sage)] py-3 text-white hover:opacity-95"
                >
                  Continue
                </button>
              </div>
            ) : null}

            {/* Step 4: Location & Tax Market */}
            {step === 4 ? (
              <div className="mt-6">
                <h2 className="text-lg font-semibold">Where do you cook?</h2>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  This configures your currency, timezone, and local tax presets.
                </p>

                <div className="mt-4 grid gap-3.5">
                  <label className="text-xs font-medium text-[var(--ink-soft)]">
                    Country / Market
                    <select
                      className="field mt-1 text-sm text-[var(--ink)]"
                      value={form.countryCode}
                      onChange={(e) => onCountry(e.target.value)}
                    >
                      {presets.map((p) => (
                        <option key={p.countryCode} value={p.countryCode}>
                          {p.label} ({p.currency})
                        </option>
                      ))}
                    </select>
                  </label>

                  {regions.length > 0 ? (
                    <label className="text-xs font-medium text-[var(--ink-soft)]">
                      {preset?.regionLabel ?? "Tax region"}
                      <select
                        className="field mt-1 text-sm text-[var(--ink)]"
                        value={form.taxRegion}
                        onChange={(e) => setForm({ ...form, taxRegion: e.target.value })}
                      >
                        {regions.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <label className="text-xs font-medium text-[var(--ink-soft)]">
                    City or neighborhood (optional)
                    <input
                      className="field mt-1 text-sm text-[var(--ink)]"
                      placeholder="e.g. Soho, Austin, Indiranagar"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </label>

                  {hint ? (
                    <p className="rounded-xl bg-[var(--paper)] px-3.5 py-2.5 text-xs text-[var(--ink-soft)]">
                      Tax preset: <strong className="text-[var(--ink)]">{hint}</strong>
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="btn mt-6 w-full bg-[var(--sage)] py-3 text-white hover:opacity-95"
                >
                  Continue
                </button>
              </div>
            ) : null}

            {/* Step 5: Owner Account */}
            {step === 5 ? (
              <form onSubmit={onSubmit} className="mt-6">
                <h2 className="text-lg font-semibold">Last step. Make it yours.</h2>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  This creates your owner login and opens your venue floor.
                </p>

                <div className="mt-4 grid gap-3">
                  <label className="text-xs font-medium text-[var(--ink-soft)]">
                    Business name
                    <input
                      className="field mt-1 text-sm text-[var(--ink)]"
                      placeholder="Harbour & Rye"
                      required
                      value={form.restaurantName}
                      onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="text-xs font-medium text-[var(--ink-soft)]">
                      First name
                      <input
                        className="field mt-1 text-sm text-[var(--ink)]"
                        required
                        autoComplete="given-name"
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      />
                    </label>
                    <label className="text-xs font-medium text-[var(--ink-soft)]">
                      Last name
                      <input
                        className="field mt-1 text-sm text-[var(--ink)]"
                        required
                        autoComplete="family-name"
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      />
                    </label>
                  </div>

                  <label className="text-xs font-medium text-[var(--ink-soft)]">
                    Email
                    <input
                      type="email"
                      className="field mt-1 text-sm text-[var(--ink)]"
                      required
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </label>

                  <label className="text-xs font-medium text-[var(--ink-soft)]">
                    Password
                    <div className="relative mt-1">
                      <input
                        type={showPassword ? "text" : "password"}
                        minLength={8}
                        className="field pr-14 text-sm text-[var(--ink)]"
                        required
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--ink-soft)] hover:text-[var(--ink)]"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    {form.password.length >= 8 ? (
                      <span className="mt-1 inline-block text-[11px] font-medium text-[var(--sage)]">
                        ✓ That&apos;ll do
                      </span>
                    ) : (
                      <span className="mt-1 inline-block text-[11px] text-[var(--ink-soft)]">
                        Minimum 8 characters
                      </span>
                    )}
                  </label>

                  <label className="mt-1 flex items-start gap-2 text-xs text-[var(--ink-soft)]">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-0.5 accent-[var(--sage)]"
                    />
                    <span>
                      Your free trial starts today. No card required. I accept the{" "}
                      <Link href="/terms" className="underline">
                        Terms
                      </Link>{" "}
                      and{" "}
                      <Link href="/privacy" className="underline">
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </label>
                </div>

                {error ? (
                  <p role="alert" className="mt-3 rounded-lg bg-[#f3d0c8] px-3 py-2 text-xs font-medium text-[var(--chili-dark)]">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={busy}
                  className="btn mt-5 w-full bg-[var(--sage)] py-3 text-white hover:opacity-95"
                >
                  {busy ? "Setting up your venue…" : "Launch my venue"}
                </button>
              </form>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-xs text-white/85">
          <span>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-white underline">
              Sign in
            </Link>
          </span>
          <Link href="/terms" className="hover:underline">
            Terms
          </Link>
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
        </div>
      </div>
    </main>
  );
}
