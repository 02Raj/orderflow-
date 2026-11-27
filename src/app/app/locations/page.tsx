"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { billingPriceLabel } from "@/lib/billing-prices";
import { PAYMENTS_ENABLED } from "@/lib/payments";
import { getToken, getUser, openLocation } from "@/lib/session";
import type { VenueLocation } from "@/lib/types";

interface CountryPreset {
  countryCode: string;
  label: string;
  regionLabel?: string;
  regions?: { code: string; label: string }[];
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<VenueLocation[] | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("");
  const [countries, setCountries] = useState<CountryPreset[]>([]);
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [taxRegion, setTaxRegion] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const regions = countries.find((country) => country.countryCode === countryCode)?.regions ?? [];

  useEffect(() => {
    const token = getToken();
    const user = getUser();
    if (!token || !user) return;
    const controller = new AbortController();
    const options = { token, signal: controller.signal };
    Promise.all([
      api<VenueLocation[]>("/auth/locations", options),
      api<CountryPreset[]>("/auth/country-presets", { signal: controller.signal }),
    ]).then(([venues, presets]) => {
      const active = venues.find((venue) => venue.id === user.restaurantId);
      setLocations(venues);
      setActiveLocationId(user.restaurantId);
      setCountries(presets);
      setCountryCode(active?.countryCode ?? "");
      setTaxRegion(active?.taxRegion ?? "");
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load locations.");
    });
    return () => controller.abort();
  }, []);

  async function open(id: string, destination?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await openLocation(id, destination);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not open the location.");
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getToken();
    if (!token || busy || createdId) return;
    setBusy(true);
    setError("");
    try {
      const created = await api<{ id: string }>("/auth/locations", {
        method: "POST",
        token,
        json: { name, countryCode, taxRegion: taxRegion || undefined },
      });
      setCreatedId(created.id);
      await openLocation(created.id, "/app?welcome=1");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not add the location.");
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader kicker="Business" title="Locations" copy="Open a branch to manage its menu, tables, kitchen, staff and billing." />
      <main className="mx-auto grid max-w-5xl gap-5 px-4 pb-8 sm:px-6 lg:grid-cols-2">
        <section className="card self-start p-5">
          <h2 className="display text-2xl">Your locations</h2>
          {!locations && !error && <p className="mt-3 text-sm" role="status">Loading locations…</p>}
          <ul className="mt-3 divide-y divide-[var(--rule)]">
            {locations?.map((location) => (
              <li key={location.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{location.name}</p>
                  <p className="text-xs text-[var(--ink-soft)]">{location.countryCode} · {location.currency}</p>
                  {PAYMENTS_ENABLED && location.billingStatus && (
                    <p className="mt-1 text-xs text-[var(--ink-soft)]">
                      <span className="capitalize">{location.billingStatus.replaceAll("_", " ")}</span>
                      {location.billingStatus === "active" && location.billingInterval && ` · ${billingPriceLabel(location.billingInterval)}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {location.id === activeLocationId ? <span className="font-semibold">Active location</span> : (
                    <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void open(location.id)}>Open</button>
                  )}
                  {PAYMENTS_ENABLED && (location.id === activeLocationId ? (
                    <Link className="underline" href="/app/settings#billing">Billing</Link>
                  ) : (
                    <button className="underline" disabled={busy} onClick={() => void open(location.id, "/app/settings#billing")}>Billing</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <form onSubmit={create} className="card self-start p-5">
          <h2 className="display text-2xl">Add a location</h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">Each location has its own subscription and starts with fresh tables and QR codes.</p>
          <label className="mt-4 block text-sm">
            Location name
            <input className="field mt-1" required maxLength={100} disabled={busy || Boolean(createdId)}
              value={name} onChange={(event) => setName(event.target.value)} placeholder="SS Cafe JLT" />
          </label>
          <label className="mt-3 block text-sm">
            Country
            <select className="field mt-1" required value={countryCode} disabled={busy || Boolean(createdId)}
              onChange={(event) => { setCountryCode(event.target.value); setTaxRegion(""); }}>
              <option value="">Choose a country</option>
              {countries.map((country) => <option key={country.countryCode} value={country.countryCode}>{country.label}</option>)}
            </select>
          </label>
          {regions.length > 0 && (
            <label className="mt-3 block text-sm">
              {countries.find((country) => country.countryCode === countryCode)?.regionLabel ?? "Tax region"}
              <select className="field mt-1" required value={taxRegion} disabled={busy || Boolean(createdId)}
                onChange={(event) => setTaxRegion(event.target.value)}>
                <option value="">Choose a region</option>
                {regions.map((region) => <option key={region.code} value={region.code}>{region.label}</option>)}
              </select>
            </label>
          )}
          {error && <p className="mt-4 text-sm text-[var(--chili-dark)]" role="alert">{error}</p>}
          {createdId ? (
            <button type="button" className="btn btn-chili mt-5" disabled={busy} onClick={() => void open(createdId, "/app?welcome=1")}>
              {busy ? "Opening location…" : "Open new location"}
            </button>
          ) : (
            <button type="submit" className="btn btn-chili mt-5" disabled={busy || !locations?.length}>
              {busy ? "Adding location…" : "Add location"}
            </button>
          )}
        </form>
      </main>
    </>
  );
}
