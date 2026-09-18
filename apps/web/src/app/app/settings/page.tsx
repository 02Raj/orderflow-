"use client";

import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { getToken } from "@/lib/session";
import { BillingStatus, Restaurant } from "@/lib/types";
import { FormEvent, useEffect, useState } from "react";

export default function SettingsPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    api<Restaurant>("/restaurant", { token }).then(setRestaurant);
    api<BillingStatus>("/billing/status", { token }).then(setBilling);
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !restaurant) return;
    const updated = await api<Restaurant>("/restaurant", {
      method: "PATCH",
      token,
      json: {
        name: restaurant.name,
        phone: restaurant.phone,
        address: restaurant.address,
        taxRateBp: restaurant.taxRateBp,
        taxInclusive: restaurant.taxInclusive,
      },
    });
    setRestaurant(updated);
    setSaved(true);
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
      : `/backend${res.url.startsWith("/") ? res.url : `/${res.url}`}`;
  }

  if (!restaurant) {
    return (
      <AppShell>
        <p className="p-8 text-sm">Loading settings…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid gap-8 p-5 md:grid-cols-2 md:p-8">
        <form onSubmit={save}>
          <h1 className="text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
            Venue
          </h1>
          <label className="mt-6 block text-sm">
            Name
            <input
              className="mt-1 w-full border border-[var(--rule)] px-3 py-2"
              value={restaurant.name}
              onChange={(e) => setRestaurant({ ...restaurant, name: e.target.value })}
            />
          </label>
          <label className="mt-3 block text-sm">
            Phone
            <input
              className="mt-1 w-full border border-[var(--rule)] px-3 py-2"
              value={restaurant.phone ?? ""}
              onChange={(e) => setRestaurant({ ...restaurant, phone: e.target.value })}
            />
          </label>
          <label className="mt-3 block text-sm">
            Address
            <input
              className="mt-1 w-full border border-[var(--rule)] px-3 py-2"
              value={restaurant.address ?? ""}
              onChange={(e) => setRestaurant({ ...restaurant, address: e.target.value })}
            />
          </label>
          <p className="mt-4 text-sm text-[var(--ink-soft)]">
            Currency {restaurant.currency} · {restaurant.taxLabel}{" "}
            {(restaurant.taxRateBp / 100).toFixed(2)}% · slug /{restaurant.slug}
          </p>
          <button className="mt-4 bg-[var(--ink)] px-4 py-2 text-sm text-[var(--ticket)]">
            Save
          </button>
          {saved ? <p className="mt-2 text-sm">Saved.</p> : null}
        </form>
        <aside className="border border-[var(--rule)] bg-[var(--ticket)] p-5">
          <h2 className="text-2xl" style={{ fontFamily: "var(--font-serif)" }}>
            Billing
          </h2>
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
              <button
                type="button"
                onClick={subscribe}
                className="mt-5 w-full bg-[var(--chili)] py-3 text-sm font-semibold text-[var(--ticket)]"
              >
                Subscribe now
              </button>
            </>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}
