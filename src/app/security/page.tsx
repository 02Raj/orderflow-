import { LegalLayout } from "@/components/legal";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security — OrderFlow",
};

export default function SecurityPage() {
  return (
    <LegalLayout kicker="Trust" title="Security" updated="19 September 2026">
      <p>
        Independent owners do not trust a kitchen tool they cannot explain to a health inspector
        or a bank. This page states what OrderFlow actually does today — not a SOC 2 badge we have
        not earned.
      </p>

      <h2 className="display pt-4 text-2xl">What we will not do</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Take guest card numbers. Pay at the table stays on your existing till / UPI / cash.</li>
        <li>Sell guest or venue data, or run ad pixels on the guest menu.</li>
        <li>Lock you into proprietary kitchen hardware.</li>
        <li>Pretend we file VAT or sales tax for you.</li>
      </ul>

      <h2 className="display pt-4 text-2xl">What is in the product now</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Passwords stored with bcrypt; sessions are JWTs.</li>
        <li>Each venue only sees its own tickets (restaurant id on every query).</li>
        <li>Login, signup, and checkout are rate-limited.</li>
        <li>HTTP security headers (Helmet) on the API.</li>
        <li>Audit log when an order is accepted, rejected, or 86’d.</li>
        <li>Kitchen updates over an authenticated stream, with polling fallback.</li>
      </ul>

      <h2 className="display pt-4 text-2xl">Sub-processors</h2>
      <p>
        Your chosen Postgres host when DATABASE_URL is set. Stripe, only if you turn on paid
        billing. No analytics suite on the guest QR path. If that list grows, it will be updated
        here first.
      </p>

      <h2 className="display pt-4 text-2xl">Your job</h2>
      <p>
        Use HTTPS in production. Restrict kitchen screens to staff. Do not share the owner login.
        Put only cooking-relevant notes in tickets. Export or delete before you walk away from a
        venue.
      </p>

      <p>
        Privacy:{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        . Processor terms:{" "}
        <Link href="/dpa" className="underline">
          DPA
        </Link>
        . Report a vulnerability:{" "}
        <a className="underline" href="mailto:security@orderflow.app">
          security@orderflow.app
        </a>
        .
      </p>
    </LegalLayout>
  );
}
