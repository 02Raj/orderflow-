import type { Metadata } from "next";
import Link from "next/link";
import { BrandLink } from "@/components/brand";
import { SiteFooter } from "@/components/legal";
import { ServicePreview } from "@/components/service-preview";
import { BILLING_INTERVALS, BILLING_PRICES, YEARLY_SAVINGS } from "@/lib/billing-prices";
import { PAYMENTS_ENABLED } from "@/lib/payments";
import { MAIL, SITE_URL } from "@/lib/site";

const title = "OrderNFlow | Serve every order on time — QR Ordering & Browser KDS";
const description =
  "Browser POS and live kitchen display for independent cafés and restaurants worldwide. Guests scan a table QR, kitchen sees the ticket immediately. No hardware contracts.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: SITE_URL },
  openGraph: { title, description, url: SITE_URL, type: "website", siteName: "OrderNFlow" },
};

const venueTypes = [
  "Coffee Shops",
  "Craft Breweries",
  "Food Trucks",
  "Independent Bistros",
  "Rooftop Bars",
  "Cloud Kitchens",
];

const visibilityCards = [
  {
    tone: "bg-[#cfe3d6]/55 border-[#b3d4bf]",
    eyebrow: "Kitchen Display",
    title: "Keep every ticket moving",
    copy: "Color-coded timers alert your cooks before an order runs late, from New to Firing to Pass.",
  },
  {
    tone: "bg-[#f3e3b6]/60 border-[#e2cb8b]",
    eyebrow: "Guest QR Menu",
    title: "Guests scan & order in seconds",
    copy: "Works in any smartphone browser with zero app downloads, modifiers, and allergy notes.",
  },
  {
    tone: "bg-[#f3d0c8]/55 border-[#e4b3a8]",
    eyebrow: "Live Analytics",
    title: "Know your rush hours",
    copy: "Track covers, average ticket times, top dishes, and local VAT/GST reports in one place.",
  },
];

const speedFeatures = [
  ["Table QR Ordering", "Print a unique code per table. Guests browse, customize modifiers, and send directly to the kitchen."],
  ["Live Kitchen Board", "Every ticket lands in real time with a running clock so cooks never lose a paper slip."],
  ["Waiter & Floor Mode", "Prefer table service? Staff can ring up orders from any phone into the exact same queue."],
  ["Instant 86 & Menu Paste", "Paste your menu in seconds and mark dishes sold out instantly across every table."],
  ["Global Tax Presets", "Built-in VAT, GST, and Sales Tax rules for US, UK, UAE, India, Europe, and Australia."],
];

const includedFeatures = [
  ["Table QR ordering", "Print a QR for each table. Guests order from their phone without downloading an app."],
  ["Waiter orders and takeaway", "Staff can send dine-in and takeaway tickets to the same kitchen queue."],
  ["Live kitchen display", "See new tickets, track prep with timers, and spot orders that need attention."],
  ["Menu and sold-out controls", "Import your menu, add modifiers, and mark dishes sold out during service."],
  ["Branch-specific staff access", "Give managers, floor staff, and kitchen staff their own logins."],
  ["Reports and local tax settings", "View sales and top dishes, export CSVs, and configure local currency and tax display."],
] as const;

const questions = [
  [
    "Does every guest have to scan a QR?",
    "No. Waiters can ring up orders from their phone using Floor mode. Both paths feed the exact same kitchen screen.",
  ],
  [
    "Do I need to buy iPads or proprietary hardware?",
    "Never. OrderNFlow runs inside any modern browser — use an existing laptop, Android tablet, iPad, or kitchen TV.",
  ],
  [
    "Do you take a percentage cut of my orders?",
    "OrderNFlow charges a flat subscription per location and takes no commission on orders. Your existing payment setup stays in place.",
  ],
  [
    "Do I have to replace my card terminal or till?",
    "Keep taking payment the way you do today (cash, card machine, or UPI). OrderNFlow powers ordering and kitchen dispatch.",
  ],
  [
    "Can I use it outside the US?",
    "Yes. Venue setup includes local currency, timezone, and VAT/GST presets for 20+ markets worldwide.",
  ],
  [
    "How fast can I go live?",
    "Answer five quick questions, paste your menu, and print your table QRs in under five minutes.",
  ],
];

export default function HomePage() {

  return (
    <div className="min-h-screen text-[var(--ink)]">
      {/* Announcement bar */}
      <div className="bg-[var(--chili-dark)] px-4 py-2 text-center text-xs font-medium text-[var(--ticket)]">
        Free trial · No hardware lock-in · 0% per-order commission{" "}
        <Link href="/signup" className="ml-1.5 font-semibold underline">
          Start free →
        </Link>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--rule)] bg-[var(--paper)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <BrandLink />
          <nav
            aria-label="Site"
            className="order-3 flex w-full items-center gap-5 text-sm font-medium text-[var(--ink-soft)] sm:order-none sm:w-auto lg:gap-8"
          >
            <a className="py-1.5 hover:text-[var(--ink)]" href="#features">
              Features
            </a>
            <a className="py-1.5 hover:text-[var(--ink)]" href="#workflow">
              How it works
            </a>
            <a className="py-1.5 hover:text-[var(--ink)]" href="#pricing">
              Pricing
            </a>
            <a className="py-1.5 hover:text-[var(--ink)]" href="#faq">
              FAQ
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <Link href="/login" className="py-2 text-sm font-semibold hover:underline">
              Sign in
            </Link>
            <Link href="/signup" className="btn btn-chili min-h-10 px-4">
              Start for free
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-12 lg:px-8 lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--rule)] bg-[var(--ticket)] px-3 py-1 text-xs font-semibold text-[var(--chili-dark)]">
              Browser POS &amp; Kitchen Display · Worldwide
            </p>
            <h1 className="display mt-5 max-w-xl text-5xl leading-[1.02] tracking-tight sm:text-6xl xl:text-[68px]">
              Serve every order <span className="text-[var(--chili)]">on time.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-7 text-[var(--ink-soft)]">
              Guests scan a table QR or order with a waiter. Tickets stream straight to your kitchen screen with timers, modifiers, and local tax — using devices you already own.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/signup" className="btn btn-chili min-h-12 px-6 text-base">
                Start for free
              </Link>
              <Link href="/login" className="btn btn-ghost min-h-12 px-5 text-base">
                Try Harbour &amp; Rye demo
              </Link>
            </div>
            <p className="mt-4 text-xs font-medium text-[var(--ink-soft)]">
              No card required · 5-minute setup · Works on any browser
            </p>
          </div>
          <ServicePreview />
        </section>

        {/* Venue types strip */}
        <section className="border-y border-[var(--rule)] bg-[var(--ticket)]/70 py-7">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ink-soft)]">
              Built for independent hospitality venues of all kinds
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-semibold text-[var(--ink)]/80">
              {venueTypes.map((v) => (
                <span key={v}>{v}</span>
              ))}
            </div>
          </div>
        </section>

        {/* 3-card visibility section */}
        <section id="workflow" className="mx-auto max-w-7xl scroll-mt-16 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="display text-3xl tracking-tight sm:text-5xl">
              Clear visibility today. Smarter service tomorrow.
            </h2>
            <p className="mt-3 text-base text-[var(--ink-soft)]">
              Connect your tables, floor team, and kitchen pass without expensive iPad contracts or per-order fees.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {visibilityCards.map((c) => (
              <div key={c.title} className={`rounded-2xl border p-6 ${c.tone}`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">
                  {c.eyebrow}
                </p>
                <h3 className="display mt-2 text-2xl">{c.title}</h3>
                <p className="mt-2.5 text-sm leading-6 text-[var(--ink-soft)]">{c.copy}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Speed & Live Kitchen Board mockup */}
        <section id="features" className="border-y border-[var(--rule)] bg-[var(--paper-2)]/70 py-14 sm:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--chili-dark)]">
                Built for rush hour
              </p>
              <h2 className="display mt-2 text-3xl tracking-tight sm:text-4xl">
                Boosting speed for kitchens of all kinds
              </h2>
              <dl className="mt-6 divide-y divide-[var(--rule)]">
                {speedFeatures.map(([title, copy]) => (
                  <div key={title} className="py-3.5">
                    <dt className="font-semibold text-[var(--ink)]">{title}</dt>
                    <dd className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{copy}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Kitchen Display Visual Mockup */}
            <div className="ticket-shadow rounded-2xl border border-[#3a3129] bg-[var(--board)] p-5 text-[var(--ticket)]">
              <div className="flex items-center justify-between border-b border-[#3a3129] pb-3 text-xs text-[#c9b89a]">
                <span className="font-semibold text-white">Kitchen Board · Live Service</span>
                <span>3 Active Tickets</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-[var(--ticket)] p-3 text-[var(--ink)]">
                  <div className="flex items-center justify-between border-b border-[var(--rule)] pb-2 text-xs font-bold">
                    <span>Table 2</span>
                    <span className="rounded bg-[#cfe3d6] px-1.5 py-0.5 text-[var(--sage)]">1:12</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs">
                    <li>1× Flat White (Oat)</li>
                    <li>2× Sourdough Toast</li>
                  </ul>
                  <div className="mt-3 rounded bg-[var(--sage)] py-1 text-center text-[11px] font-semibold text-white">
                    On Time
                  </div>
                </div>

                <div className="rounded-xl bg-[var(--ticket)] p-3 text-[var(--ink)]">
                  <div className="flex items-center justify-between border-b border-[var(--rule)] pb-2 text-xs font-bold">
                    <span>Table 5</span>
                    <span className="rounded bg-[#f3e3b6] px-1.5 py-0.5 text-[var(--ink)]">5:40</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs">
                    <li>2× Smash Burger</li>
                    <li className="text-[var(--chili-dark)]">• No pickles</li>
                    <li>1× Truffle Fries</li>
                  </ul>
                  <div className="mt-3 rounded bg-[var(--amber)] py-1 text-center text-[11px] font-semibold text-white">
                    Firing
                  </div>
                </div>

                <div className="rounded-xl bg-[var(--ticket)] p-3 text-[var(--ink)]">
                  <div className="flex items-center justify-between border-b border-[var(--rule)] pb-2 text-xs font-bold">
                    <span>Table 8</span>
                    <span className="rounded bg-[#f3d0c8] px-1.5 py-0.5 text-[var(--chili-dark)]">9:18</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs">
                    <li>1× Fish Pie</li>
                    <li className="text-[var(--chili-dark)]">• Sesame allergy</li>
                  </ul>
                  <div className="mt-3 rounded bg-[var(--chili)] py-1 text-center text-[11px] font-semibold text-white">
                    Rush
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-16 bg-[var(--board)] py-16 text-[var(--ticket)] sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c9b89a]">
                Simple, flat pricing
              </p>
              <h2 className="display mt-2 text-3xl tracking-tight sm:text-5xl">
                QR ordering and kitchen tools in one plan.
              </h2>
              <p className="mt-3 text-base text-[#e4d7c5]">
                Same features with monthly or yearly billing. Use the devices you already have and pay zero OrderNFlow commission on orders.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {BILLING_INTERVALS.map((interval) => {
                const price = BILLING_PRICES[interval];
                return (
                  <div key={interval} className={`rounded-2xl border p-6 ${interval === "yearly" ? "border-[var(--chili)] bg-[#231b15]" : "border-[#3a3129] bg-[#1c1713]"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">{price.name}</h3>
                      {interval === "yearly" && <span className="rounded-full bg-[var(--chili)] px-3 py-1 text-xs font-semibold text-white">Save US${YEARLY_SAVINGS}</span>}
                    </div>
                    <p className="display mt-3 text-4xl">US${price.amount}</p>
                    <p className="mt-1 text-sm text-[#e4d7c5]">Per location, billed every {price.period}.</p>
                    <div className="mt-5 border-t border-[#514438] pt-5">
                      <p className="text-sm font-semibold">What&apos;s included</p>
                      <ul className="mt-3 space-y-3 text-sm">
                        {includedFeatures.map(([feature, detail]) => (
                          <li key={feature} className="flex items-start gap-2.5">
                            <span aria-hidden="true" className="shrink-0 font-semibold text-[#edb39f]">✓</span>
                            <div>
                              <p className="font-semibold">{feature}</p>
                              <p className="mt-0.5 leading-relaxed text-[#e4d7c5]">{detail}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 rounded-2xl border border-[#3a3129] bg-[#1c1713] p-6">
              <h3 className="display text-2xl">Multiple locations, one owner login</h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#e4d7c5]">
                Add branches and switch between them from one account. Each location keeps its own menu, table QR codes, kitchen queue, staff access, reports, and subscription.
              </p>
              <p className="mt-3 text-sm font-semibold">
                Two locations cost US${BILLING_PRICES.monthly.amount * 2}/month or US${BILLING_PRICES.yearly.amount * 2}/year when both use the same billing cycle.
              </p>
            </div>
            <Link href="/signup" className="btn btn-chili mt-6 px-8 py-3">Start free trial</Link>
            {!PAYMENTS_ENABLED && <p className="mt-3 text-sm text-[#c9b89a]">Paid subscriptions open after early access.</p>}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-7xl scroll-mt-16 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="max-w-xl">
            <h2 className="display text-3xl tracking-tight sm:text-4xl">
              Got questions? We got answers.
            </h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Still unsure?{" "}
              <a className="font-semibold text-[var(--ink)] underline" href={`mailto:${MAIL.hello}`}>
                Email our team
              </a>
              .
            </p>
          </div>
          <div className="mt-8 grid gap-x-10 md:grid-cols-2">
            {questions.map(([question, answer]) => (
              <details key={question} className="border-b border-[var(--rule)] py-3.5">
                <summary className="cursor-pointer py-1 font-semibold">{question}</summary>
                <p className="pt-2 text-sm leading-6 text-[var(--ink-soft)]">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-[var(--chili)] p-7 text-[var(--ticket)] sm:flex-row sm:items-center sm:p-10">
            <div>
              <h2 className="display text-3xl sm:text-4xl">Order up — launch in 5 minutes.</h2>
              <p className="mt-2 max-w-xl text-sm text-[#f8dcd8]">
                Create your venue, print table QRs, and test a live ticket on your kitchen screen today.
              </p>
            </div>
            <Link href="/signup" className="btn shrink-0 bg-[var(--ticket)] px-6 py-3 text-[var(--ink)]">
              Start for free
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
