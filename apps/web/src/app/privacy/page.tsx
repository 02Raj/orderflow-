import { LegalLayout } from "@/components/legal";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — OrderFlow",
  description: "How OrderFlow handles restaurant and guest data. We do not sell personal data.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout kicker="Legal" title="Privacy Policy" updated="19 September 2026">
      <p>
        This notice explains how OrderFlow handles personal data. It is written for restaurant
        owners (our customers) and for guests who scan a table QR. It is not legal advice. If you
        need a signed contract for your counsel, use the{" "}
        <Link href="/dpa" className="underline">
          Data Processing Addendum
        </Link>
        .
      </p>

      <h2 className="display pt-4 text-2xl">Who does what</h2>
      <p>
        <strong>Restaurant operators</strong> are the controller of guest order data (what was
        ordered, table number, optional name and kitchen notes). You decide why that data exists.
        OrderFlow is the <strong>processor</strong>: we host and show tickets so your kitchen can
        cook.
      </p>
      <p>
        OrderFlow is the <strong>controller</strong> of staff accounts, billing, security logs, and
        this marketing website.
      </p>

      <h2 className="display pt-4 text-2xl">What we collect</h2>
      <p>
        <strong>Staff / owner accounts:</strong> name, email, password hash (bcrypt, not the
        password itself), role, restaurant settings, tax configuration.
      </p>
      <p>
        <strong>Guest QR orders (on behalf of the restaurant):</strong> table identifier, items,
        modifiers, quantities, prices, optional guest name, optional notes (including allergy text a
        guest types). We do not ask for email, phone, or card numbers on the guest menu. We do not
        process guest card payments.
      </p>
      <p>
        <strong>Technical:</strong> IP address and user-agent on API requests, used for rate
        limiting, abuse prevention, and keeping the kitchen stream alive. Session tokens live in the
        staff browser (localStorage). The guest flow does not require an account.
      </p>
      <p>
        Allergy and health notes in free-text fields can be sensitive. We do not require them.
        Restaurants should tell guests not to put medical records in the note box — only what the
        kitchen must know to cook the plate.
      </p>

      <h2 className="display pt-4 text-2xl">Why we process it</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>To provide the product you signed up for (contract).</li>
        <li>To secure the service (rate limits, Helmet headers, audit logs, JWT expiry).</li>
        <li>To bill a subscription when you choose to pay (Stripe or a local mock in development).</li>
        <li>Guest orders: only to deliver the ticket to that restaurant’s kitchen.</li>
      </ul>
      <p>We do not sell personal data. We do not run advertising pixels or sell lookalike audiences.</p>

      <h2 className="display pt-4 text-2xl">Where data lives</h2>
      <p>
        Production uses the Postgres database you configure (for example a region you pick with your
        host). Local development can run on a machine-local database. Staff in other countries may
        access support data only if you ask us to. We will name subprocessors (hosting, email,
        Stripe) as they are connected and keep that list on the{" "}
        <Link href="/security" className="underline">
          Security
        </Link>{" "}
        page.
      </p>

      <h2 className="display pt-4 text-2xl">How long we keep it</h2>
      <p>
        Account and venue data: for the life of the account, then deleted or anonymised within 30
        days of a verified deletion request, unless law requires a longer hold (tax, disputes).
        Kitchen tickets: retained so you can close the day and run reports; you may ask us to export
        or delete a venue’s orders. Security logs: typically up to 90 days.
      </p>

      <h2 className="display pt-4 text-2xl">Your rights</h2>
      <p>
        Depending on where you live, this may include access, correction, deletion, portability,
        restriction, objection, withdrawal of consent, and a complaint to a regulator (ICO, a
        European DPA, California CPPA, UAE / Saudi PDPL authority, or India’s Data Protection
        Board). Guests should contact the restaurant first — they control the order. We will help
        the restaurant fulfil the request. Write to{" "}
        <a className="underline" href="mailto:privacy@orderflow.app">
          privacy@orderflow.app
        </a>
        .
      </p>
      <p>
        California: we do not sell or share personal information as those words are used in the
        CCPA/CPRA.
      </p>
      <p>
        India DPDP: this notice is meant to be readable on its own. You may withdraw consent for
        optional processing by emailing us; service-necessary data is required to run the kitchen
        ticket.
      </p>

      <h2 className="display pt-4 text-2xl">Cookies</h2>
      <p>
        We use only what is needed to run the app: authentication storage for staff, and a service
        worker in production so the kitchen board can be installed as a PWA. No marketing cookies.
        No cookie wall.
      </p>

      <h2 className="display pt-4 text-2xl">Children</h2>
      <p>OrderFlow is a business product. It is not directed at children under 16.</p>

      <h2 className="display pt-4 text-2xl">Changes</h2>
      <p>
        If we change what we collect in a material way, we will update this page and the date
        above. Continued use after that date is acceptance of the revised notice.
      </p>
    </LegalLayout>
  );
}
