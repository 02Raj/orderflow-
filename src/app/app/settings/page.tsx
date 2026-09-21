"use client";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { api, formatMoney } from "@/lib/api";
import { getToken } from "@/lib/session";
import { computeTotals, formatTaxRate, taxGuestHint } from "@/lib/tax";
import { BillingStatus, Restaurant } from "@/lib/types";
import { FormEvent, useEffect, useMemo, useState } from "react";

interface TaxRegion {
  code: string;
  label: string;
  taxRateBp: number;
  timezone?: string;
  taxLabel?: string;
}

interface CountryPreset {
  countryCode: string;
  label: string;
  currency: string;
  taxLabel: string;
  taxRateBp: number;
  taxInclusive: boolean;
  taxNumberLabel: string;
  regionLabel?: string;
  regions?: TaxRegion[];
}

export default function SettingsPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [presets, setPresets] = useState<CountryPreset[]>([]);
  const [saved, setSaved] = useState(false);
  const [rateInput, setRateInput] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    api<Restaurant>("/restaurant", { token }).then((r) => {
      setRestaurant(r);
      setRateInput((r.taxRateBp / 100).toString());
    });
    api<BillingStatus>("/billing/status", { token }).then(setBilling);
    api<CountryPreset[]>("/auth/country-presets").then(setPresets).catch(() => undefined);
  }, []);

  const preset = presets.find((p) => p.countryCode === restaurant?.countryCode);
  const regions = preset?.regions ?? [];

  const preview = useMemo(() => {
    if (!restaurant) return null;
    return computeTotals(1000, {
      taxRateBp: restaurant.taxRateBp,
      taxInclusive: restaurant.taxInclusive,
    });
  }, [restaurant]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !restaurant) return;
    const taxRateBp = Math.round(Number(rateInput) * 100);
    const updated = await api<Restaurant>("/restaurant", {
      method: "PATCH",
      token,
      json: {
        name: restaurant.name,
        phone: restaurant.phone,
        address: restaurant.address,
        taxRegion: restaurant.taxRegion || null,
        taxRateBp: Number.isFinite(taxRateBp) ? Math.max(0, Math.min(5000, taxRateBp)) : restaurant.taxRateBp,
        taxInclusive: restaurant.taxInclusive,
        taxNumber: restaurant.taxNumber || null,
        taxLabel: restaurant.taxLabel,
      },
    });
    setRestaurant(updated);
    setRateInput((updated.taxRateBp / 100).toString());
    setSaved(true);
  }

  function applyRegion(code: string) {
    if (!restaurant) return;
    const region = regions.find((r) => r.code === code);
    setRestaurant({
      ...restaurant,
      taxRegion: code,
      taxRateBp: region?.taxRateBp ?? restaurant.taxRateBp,
      taxLabel: region?.taxLabel ?? restaurant.taxLabel,
    });
    if (region) setRateInput((region.taxRateBp / 100).toString());
  }

  async function subscribe() {
    const token = getToken();
    if (!token) return;
    const res = await api<{ url: string }>("/billing/checkout", {
      method: "POST",
      token,
      json: {
        successUrl: `${window.location.origin}/app/settings?billing=success`,
        cancelUrl: `${window.location.origin}/app/settings?billing=cancelled`,
      },
    });
    window.location.href = res.url.startsWith("http")
      ? res.url
      : `/api${res.url.startsWith("/") ? res.url : `/${res.url}`}`;
  }

  if (!restaurant) {
    return (
      <AppShell>
        <div className="p-8">
          <div className="skeleton h-10 w-48" />
          <div className="skeleton mt-6 h-64 w-full max-w-xl" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid gap-8 p-5 md:grid-cols-2 md:p-8">
        <form onSubmit={save}>
          <PageHeader kicker="Venue" title="Settings" copy="Name, contact, and tax for this market." />
          <label className="mt-6 block text-sm">
            Name
            <input
              className="field mt-1"
              value={restaurant.name}
              onChange={(e) => setRestaurant({ ...restaurant, name: e.target.value })}
            />
          </label>
          <label className="mt-3 block text-sm">
            Phone
            <input
              className="field mt-1"
              value={restaurant.phone ?? ""}
              onChange={(e) => setRestaurant({ ...restaurant, phone: e.target.value })}
            />
          </label>
          <label className="mt-3 block text-sm">
            Address
            <input
              className="field mt-1"
              value={restaurant.address ?? ""}
              onChange={(e) => setRestaurant({ ...restaurant, address: e.target.value })}
            />
          </label>
          <p className="mt-4 text-sm text-[var(--ink-soft)]">
            {preset?.label ?? restaurant.countryCode} · {restaurant.currency} · slug /{restaurant.slug}
          </p>

          <div className="card mt-8 p-4">
            <h2 className="font-semibold">Tax on tickets</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
              OrderFlow does not collect this tax. It only prints the number the guest and kitchen
              should see. You still file with your accountant / FTA / HMRC / GST portal.
            </p>
            {regions.length ? (
              <label className="mt-4 block text-sm">
                {preset?.regionLabel ?? "Region"}
                <select
                  className="field mt-1"
                  value={restaurant.taxRegion ?? ""}
                  onChange={(e) => applyRegion(e.target.value)}
                >
                  <option value="">Select…</option>
                  {regions.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label} · {formatTaxRate(r.taxRateBp)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="mt-3 block text-sm">
              {restaurant.taxLabel} rate (%)
              <input
                className="field mt-1"
                inputMode="decimal"
                value={rateInput}
                onChange={(e) => {
                  setRateInput(e.target.value);
                  const bp = Math.round(Number(e.target.value) * 100);
                  if (Number.isFinite(bp)) setRestaurant({ ...restaurant, taxRateBp: bp });
                }}
              />
            </label>
            <label className="mt-3 block text-sm">
              {preset?.taxNumberLabel ?? "Tax number"}
              <input
                className="field mt-1"
                value={restaurant.taxNumber ?? ""}
                onChange={(e) => setRestaurant({ ...restaurant, taxNumber: e.target.value })}
              />
            </label>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={restaurant.taxInclusive}
                onChange={(e) => setRestaurant({ ...restaurant, taxInclusive: e.target.checked })}
              />
              <span>
                Menu prices already include {restaurant.taxLabel}
                <span className="block text-xs text-[var(--ink-soft)]">
                  On for UK, EU, AU, NZ, India, UAE and GCC. Off for US and Canada (tax added at the
                  till).
                </span>
              </span>
            </label>
            {preview ? (
              <p className="mt-4 rounded-xl bg-[var(--paper)] px-3 py-2 text-xs leading-5 text-[var(--ink-soft)]">
                {taxGuestHint(restaurant.taxInclusive, restaurant.taxLabel, restaurant.taxRateBp)}{" "}
                Example on {formatMoney(1000, restaurant.currency, restaurant.locale)}: net{" "}
                {formatMoney(preview.subtotalMinor, restaurant.currency, restaurant.locale)},{" "}
                {restaurant.taxLabel}{" "}
                {formatMoney(preview.taxMinor, restaurant.currency, restaurant.locale)}, due{" "}
                {formatMoney(preview.totalMinor, restaurant.currency, restaurant.locale)}.
              </p>
            ) : null}
          </div>

          <button className="btn btn-ink mt-4">Save</button>
          {saved ? <p className="mt-2 text-sm">Saved.</p> : null}
        </form>
        <aside className="card p-5">
          <h2 className="display text-2xl">Billing</h2>
          {billing ? (
            <>
              <p className="mt-3 text-sm">
                Status: {billing.status}
                {billing.status === "trialing" ? ` · ${billing.daysLeftInTrial} days left` : ""}
              </p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">{billing.priceLabel}</p>
              {billing.mockMode ? (
                <p className="mt-3 text-xs text-[var(--ink-soft)]">
                  Stripe keys are not set. Checkout uses a local mock so you can test the trial →
                  paid gate before adding credentials.
                </p>
              ) : null}
              <button type="button" onClick={subscribe} className="btn btn-chili mt-5 w-full py-3">
                Subscribe now
              </button>
            </>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}
