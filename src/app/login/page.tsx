"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { saveSession, SessionUser } from "@/lib/session";
import { SiteFooter } from "@/components/legal";
import { BrandLink } from "@/components/brand";

export default function LoginPage() {
  const [email, setEmail] = useState("owner@harbourandrye.demo");
  const [password, setPassword] = useState("harbour-demo");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loginWith(targetEmail: string, targetPassword: string, isDemo = false) {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ token: string; user: SessionUser }>("/auth/login", {
        method: "POST",
        json: { email: targetEmail, password: targetPassword },
      });
      saveSession(res.token, res.user);
      if (res.user.role === "kitchen") {
        window.location.assign("/kitchen");
      } else {
        window.location.assign(isDemo ? "/app?demo=1" : "/app");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const isDemo = email.trim().toLowerCase().endsWith("@harbourandrye.demo");
    await loginWith(email, password, isDemo);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <BrandLink />
      <h1 className="display mt-8 text-4xl">Sign in</h1>
      <p className="mt-2 text-sm text-[var(--ink-soft)]">
        Jump straight into the live Harbour &amp; Rye demo or sign in to your own venue.
      </p>

      {/* One-Click Predefined Demo Accounts */}
      <div className="mt-6 rounded-2xl border border-[var(--rule)] bg-[var(--paper-2)]/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--chili-dark)]">
          1-Click Live Demo · Harbour &amp; Rye
        </p>
        <p className="mt-1 text-xs text-[var(--ink-soft)]">
          Pre-loaded with 8 QR tables, full menu, and guided walkthrough.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => loginWith("owner@harbourandrye.demo", "harbour-demo", true)}
            className="btn btn-chili flex-col items-start gap-0.5 px-3 py-2.5 text-left"
          >
            <span className="text-xs font-bold">Owner &amp; Floor</span>
            <span className="text-[11px] font-normal opacity-90">Guided tour →</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => loginWith("kitchen@harbourandrye.demo", "harbour-demo", true)}
            className="btn btn-ink flex-col items-start gap-0.5 px-3 py-2.5 text-left"
          >
            <span className="text-xs font-bold">Kitchen Screen</span>
            <span className="text-[11px] font-normal opacity-80">Live KDS view →</span>
          </button>
        </div>
      </div>

      <form onSubmit={onSubmit} method="post" action="/app" className="card mt-5 space-y-4 p-5">
        <label className="block text-sm font-medium">
          Email
          <input
            className="field mt-1.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <label className="block text-sm font-medium">
          <span className="flex items-center justify-between">
            <span>Password</span>
            <Link href="/forgot-password" className="text-xs font-medium text-[var(--chili-dark)] underline">
              Forgot password?
            </Link>
          </span>
          <input
            className="field mt-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="text-sm text-[var(--chili)]">{error}</p> : null}
        <button type="submit" disabled={busy} className="btn btn-ink w-full py-3">
          {busy ? "Signing in…" : "Enter venue"}
        </button>
      </form>
      <p className="mt-6 text-sm text-[var(--ink-soft)]">
        New restaurant?{" "}
        <Link href="/signup" className="underline">
          Create a venue
        </Link>
      </p>
      <div className="mt-12">
        <Link href="/admin" className="mb-4 inline-block text-sm text-[var(--ink-soft)] underline">
          Platform admin
        </Link>
        <SiteFooter />
      </div>
    </main>
  );
}
