"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { saveSession, SessionUser } from "@/lib/session";

interface Preset {
  countryCode: string;
  label: string;
  currency: string;
}

export default function SignupPage() {
  const router = useRouter();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    restaurantName: "",
    countryCode: "US",
  });

  useEffect(() => {
    api<Preset[]>("/auth/country-presets")
      .then(setPresets)
      .catch(() => setPresets([{ countryCode: "US", label: "United States", currency: "USD" }]));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ token: string; user: SessionUser }>("/auth/signup", {
        method: "POST",
        json: form,
      });
      saveSession(res.token, res.user);
      router.push("/app/menu");
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
      <h1 className="mt-4 text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
        Open your floor
      </h1>
      <p className="mt-2 text-sm text-[var(--ink-soft)]">
        Creates the venue, eight tables, and QR tokens. Paste the menu next.
      </p>
      <form onSubmit={onSubmit} className="mt-8 grid gap-4">
        <label className="text-sm">
          Your name
          <input
            className="mt-1 w-full border border-[var(--rule)] bg-white px-3 py-2"
            required
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Restaurant name
          <input
            className="mt-1 w-full border border-[var(--rule)] bg-white px-3 py-2"
            required
            value={form.restaurantName}
            onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Country
          <select
            className="mt-1 w-full border border-[var(--rule)] bg-white px-3 py-2"
            value={form.countryCode}
            onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
          >
            {presets.map((p) => (
              <option key={p.countryCode} value={p.countryCode}>
                {p.label} · {p.currency}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Email
          <input
            type="email"
            className="mt-1 w-full border border-[var(--rule)] bg-white px-3 py-2"
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
            className="mt-1 w-full border border-[var(--rule)] bg-white px-3 py-2"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        {error ? <p className="text-sm text-[var(--chili)]">{error}</p> : null}
        <button
          disabled={busy}
          className="bg-[var(--chili)] py-3 text-sm font-semibold text-[var(--ticket)]"
        >
          {busy ? "Opening…" : "Start free trial"}
        </button>
      </form>
    </main>
  );
}
