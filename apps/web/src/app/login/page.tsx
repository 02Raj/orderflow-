"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { saveSession, SessionUser } from "@/lib/session";
import { SiteFooter } from "@/components/legal";

export default function LoginPage() {
  const [email, setEmail] = useState("owner@harbourandrye.demo");
  const [password, setPassword] = useState("harbour-demo");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ token: string; user: SessionUser }>("/auth/login", {
        method: "POST",
        json: { email, password },
      });
      saveSession(res.token, res.user);
      window.location.assign(res.user.role === "kitchen" ? "/kitchen" : "/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <Link href="/" className="text-sm text-[var(--ink-soft)]">
        ← OrderFlow
      </Link>
      <h1 className="display mt-4 text-4xl">Sign in</h1>
      <p className="mt-2 text-sm text-[var(--ink-soft)]">
        Demo venue or your trial account. Works from any country.
      </p>
      <form onSubmit={onSubmit} method="post" action="/app" className="card mt-8 space-y-4 p-5">
        <label className="block text-sm">
          Email
          <input
            className="field mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className="field mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </label>
        {error ? <p className="text-sm text-[var(--chili)]">{error}</p> : null}
        <button type="submit" disabled={busy} className="btn btn-ink w-full py-3">
          {busy ? "Signing in…" : "Enter venue"}
        </button>
      </form>
      <p className="mt-6 text-sm">
        New restaurant?{" "}
        <Link href="/signup" className="underline">
          Start a 45-day trial
        </Link>
      </p>
      <div className="mt-10">
        <SiteFooter />
      </div>
    </main>
  );
}
