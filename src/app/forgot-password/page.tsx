"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { BrandLink } from "@/components/brand";
import { SiteFooter } from "@/components/legal";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [devResetUrl, setDevResetUrl] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setDevResetUrl("");
    try {
      const res = await api<{ ok: boolean; message: string; devResetUrl?: string }>(
        "/auth/forgot-password",
        {
          method: "POST",
          json: { email: email.trim() },
        },
      );
      setMessage(res.message);
      if (res.devResetUrl) setDevResetUrl(res.devResetUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send reset request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <BrandLink />
      <h1 className="display mt-8 text-4xl">Reset password</h1>
      <p className="mt-2 text-sm text-[var(--ink-soft)]">
        Enter the email on your venue account to request a password reset link.
      </p>

      <form method="post" onSubmit={onSubmit} className="card mt-8 space-y-4 p-5">
        <label className="block text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            className="field mt-1.5"
            placeholder="owner@yourcafe.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm text-[var(--chili)]">
            {error}
          </p>
        ) : null}

        {message ? (
          <div role="status" className="rounded-xl border border-[#b3d4bf] bg-[#cfe3d6]/55 p-3.5 text-sm text-[var(--ink)]">
            <p>{message}</p>
            {devResetUrl ? (
              <p className="mt-2 text-xs">
                Local dev reset link:{" "}
                <a href={devResetUrl} className="font-semibold text-[var(--sage)] underline break-all">
                  Open reset page →
                </a>
              </p>
            ) : null}
          </div>
        ) : null}

        <button type="submit" disabled={busy} className="btn btn-ink w-full py-3">
          {busy ? "Preparing link…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-sm text-[var(--ink-soft)]">
        Remembered it?{" "}
        <Link href="/login" className="underline">
          Back to sign in
        </Link>
      </p>
      <div className="mt-12">
        <SiteFooter />
      </div>
    </main>
  );
}
