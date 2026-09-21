import { LegalLayout } from "@/components/legal";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — OrderFlow",
};

export default function TermsPage() {
  return (
    <LegalLayout kicker="Legal" title="Terms of Service" updated="19 September 2026">
      <p>
        These terms are the contract between you (the restaurant / venue) and the operator of
        OrderFlow. They are a working baseline for an independent SaaS, not a substitute for
        counsel in your country.
      </p>

      <h2 className="display pt-4 text-2xl">The service</h2>
      <p>
        OrderFlow provides QR guest menus, kitchen tickets, staff logins, menu and table tools, and
        reports in a web browser. We do not take guest card payments. You keep collecting payment
        the way you already do. Tax figures on tickets are display helpers; you remain responsible
        for tax filing.
      </p>

      <h2 className="display pt-4 text-2xl">Accounts</h2>
      <p>
        You must be able to bind your business. You are responsible for staff logins and for what
        is ordered on your tables. Keep passwords private. Kitchen and owner roles exist so the
        pass does not share the owner password.
      </p>

      <h2 className="display pt-4 text-2xl">Acceptable use</h2>
      <p>
        Do not attack the service, scrape other venues, send malware, or use OrderFlow for anything
        illegal. Do not put children’s data or unnecessary health records into tickets. Allergy
        notes should be only what the kitchen needs for that plate.
      </p>

      <h2 className="display pt-4 text-2xl">Trial and fees</h2>
      <p>
        New venues start on a 45-day trial unless we say otherwise. After trial, ordering may pause
        until you subscribe. Price is shown at signup and on the marketing site (currently USD 29
        per venue / month). We may change price with notice for future periods; we will not silently
        add hardware or payment lock-in.
      </p>

      <h2 className="display pt-4 text-2xl">Data and privacy</h2>
      <p>
        Our{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/dpa" className="underline">
          DPA
        </Link>{" "}
        apply. You own your menu, tickets, and reports. You may export or request deletion. We may
        use aggregated, de-identified usage to keep the product up (for example: the kitchen stream
        is healthy). We do not sell your guest list — we do not build a guest list.
      </p>

      <h2 className="display pt-4 text-2xl">Availability</h2>
      <p>
        We aim for the kitchen board to update in real time, with polling as fallback. We do not
        promise 100% uptime. You should keep a paper or verbal backup during a full internet
        outage, as you would with any cloud tool.
      </p>

      <h2 className="display pt-4 text-2xl">Liability</h2>
      <p>
        To the extent allowed by law, OrderFlow is provided “as is.” We are not liable for lost
        covers, food waste, or tax mistakes beyond what mandatory law forbids us from limiting. Our
        aggregate liability in a year is capped at the fees you paid us in the three months before
        the claim. Nothing here limits liability for fraud or death/personal injury caused by
        negligence where that cannot be limited.
      </p>

      <h2 className="display pt-4 text-2xl">End</h2>
      <p>
        You may stop anytime. We may suspend for non-payment or abuse. After termination we delete
        or return venue data as described in the DPA, except records we must keep by law.
      </p>

      <p>
        Questions:{" "}
        <a className="underline" href="mailto:hello@orderflow.app">
          hello@orderflow.app
        </a>
        .
      </p>
    </LegalLayout>
  );
}
