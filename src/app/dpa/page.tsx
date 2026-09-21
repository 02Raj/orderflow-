import { LegalLayout } from "@/components/legal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Processing Addendum — OrderFlow",
};

export default function DpaPage() {
  return (
    <LegalLayout kicker="Legal" title="Data Processing Addendum" updated="19 September 2026">
      <p>
        This DPA is how GDPR-style processor rules attach to OrderFlow when you (the restaurant)
        are the controller of guest and staff-on-shift data. Using the service includes this
        addendum. Have your lawyer review it before you rely on it in an enterprise deal.
      </p>

      <h2 className="display pt-4 text-2xl">Roles</h2>
      <p>
        You are the controller. OrderFlow is the processor for: guest QR orders, table tokens,
        tickets, kitchen status, and staff accounts you create to run service. OrderFlow is an
        independent controller for our own billing, security of the platform, and the marketing
        site.
      </p>

      <h2 className="display pt-4 text-2xl">Instructions</h2>
      <p>
        We process only to provide OrderFlow: store the ticket, stream it to kitchen and floor,
        show reports, and let you edit the menu. We will not use guest orders to train public AI
        models or to advertise. If law forces us to process another way, we tell you unless the law
        forbids it.
      </p>

      <h2 className="display pt-4 text-2xl">Data</h2>
      <p>
        Subjects: your guests and your staff. Data: names you or they type, emails of staff,
        order contents, modifiers, notes, table numbers, timestamps, amounts, IP/user-agent for
        security. Special category: we do not request health data; free-text allergy notes may
        incidentally include it — you must minimise that.
      </p>

      <h2 className="display pt-4 text-2xl">Security</h2>
      <p>
        Measures currently in product: HTTPS in production, hashed passwords (bcrypt), JWT
        sessions, Helmet security headers, rate limits on login/signup/checkout, tenant scoping by
        restaurant id, audit logs of status changes. Details live on the Security page. We will
        notify you without undue delay if we confirm a personal-data breach affecting your venue.
      </p>

      <h2 className="display pt-4 text-2xl">Sub-processors</h2>
      <p>
        Hosting/database of your choosing when you set DATABASE_URL; Stripe if you enable paid
        billing. We will list additions on the Security page and give a reasonable objection
        window before a material new sub-processor goes live on guest data.
      </p>

      <h2 className="display pt-4 text-2xl">Assistance, deletion, audit</h2>
      <p>
        We will help with guest/staff rights requests that you cannot fulfil in the product.
        At the end of the service we delete or return your venue data within 30 days of a written
        request, except backups that expire on rotation and records we must keep. You may ask for
        a written description of our technical measures; formal SOC 2 is not claimed until we
        publish a report.
      </p>

      <p>
        Contact:{" "}
        <a className="underline" href="mailto:privacy@orderflow.app">
          privacy@orderflow.app
        </a>
        .
      </p>
    </LegalLayout>
  );
}
