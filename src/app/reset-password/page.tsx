"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { BrandLink } from "@/components/brand";
import { SiteFooter } from "@/components/legal";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("Missing reset token. Request a new password reset link.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await api<{ ok: boolean }>("/auth/reset-password", {
        method: "POST",
        json: { token, newPassword },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card mt-8 space-y-4 p-5">
        <p className="text-sm font-semibold text-[var(--sage)]">
          ✓ Your password has been updated.
        </p>
        <Link href="/login" className="btn btn-ink w-full py-3">
          Sign in with new password
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card mt-8 space-y-4 p-5">
      <label className="block text-sm font-medium">
        New password
        <input
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="field mt-1.5"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </label>
      <label className="block text-sm font-medium">
        Confirm new password
        <input
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="field mt-1.5"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-[var(--chili)]">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="btn btn-ink w-full py-3">
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <BrandLink />
      <h1 className="display mt-8 text-4xl">Choose a new password</h1>
      <p className="mt-2 text-sm text-[var(--ink-soft)]">
        Minimum 8 characters. Keep it private.
      </p>
      <Suspense fallback={<div className="card mt-8 p-5 text-sm">Loading…</div>}>
        <ResetForm />
      </Suspense>
      <p className="mt-6 text-sm text-[var(--ink-soft)]">
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
