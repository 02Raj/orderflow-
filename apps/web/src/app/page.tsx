import Link from "next/link";
import { SiteFooter } from "@/components/legal";

const MARKETS = ["USD", "GBP", "EUR", "AED", "INR", "AUD", "SGD", "ZAR", "BRL", "JPY"];

export default function HomePage() {
  return (
    <main className="min-h-screen text-[var(--ink)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--chili)] font-[family-name:var(--font-serif)] text-sm text-[var(--ticket)]">
            OF
          </span>
          <strong className="tracking-tight">OrderFlow</strong>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <a href="#pricing" className="hidden px-3 py-2 text-[var(--ink-soft)] sm:inline">
            Pricing
          </a>
          <Link href="/login" className="px-3 py-2 text-[var(--ink-soft)]">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-ink">
            Start 45-day trial
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-6 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="rise-in">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--chili)]">
            Global restaurant OS · QR to kitchen
          </p>
          <h1 className="display mt-4 max-w-xl text-4xl leading-[1.05] md:text-6xl">
            Guests scan. Kitchen sees. Tickets never get lost.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-7 text-[var(--ink-soft)]">
            OrderFlow is browser POS for independent restaurants worldwide. Put a QR on each table.
            Orders land on a kitchen screen in real time — with modifiers, notes, tax for your
            market, and a running clock. No tablet contract. No app download.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-chili px-5 py-3">
              Open a venue in five minutes
            </Link>
            <Link href="/login" className="btn btn-ghost px-5 py-3">
              Try Harbour & Rye demo
            </Link>
          </div>
          <p className="mt-4 text-sm text-[var(--ink-soft)]">
            Demo: <code>owner@harbourandrye.demo</code> / <code>harbour-demo</code>
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {MARKETS.map((c) => (
              <span
                key={c}
                className="rounded-full border border-[var(--rule)] bg-white/70 px-2.5 py-1 text-[11px] font-semibold tracking-wide"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="ticket-shadow rise-in rounded-2xl bg-[var(--ticket)] p-5">
          <div className="flex items-center justify-between border-b border-dashed border-[var(--rule)] pb-3 text-xs uppercase tracking-widest text-[var(--ink-soft)]">
            <span>Kitchen · Table 4 · live</span>
            <span className="rounded-md bg-[#f3d0c8] px-2 py-1 font-bold text-[var(--chili)]">
              0:14
            </span>
          </div>
          <ol className="mt-4 space-y-3 text-sm">
            <li className="flex justify-between">
              <span>
                1× Harbour fish pie
                <em className="mt-1 block text-[var(--ink-soft)] not-italic">No cheese crust</em>
              </span>
              <span>£16.50</span>
            </li>
            <li className="flex justify-between">
              <span>
                2× Crispy squid
                <em className="mt-1 block text-[var(--ink-soft)] not-italic">Allergy: sesame</em>
              </span>
              <span>£19.00</span>
            </li>
          </ol>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs font-semibold uppercase tracking-wider">
            <span className="rounded-lg bg-[#f3d0c8] px-2 py-2">New</span>
            <span className="rounded-lg bg-[#f3e3b6] px-2 py-2">Firing</span>
            <span className="rounded-lg bg-[#cfe3d6] px-2 py-2">Pass</span>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--rule)] bg-[#efe4cc]/80">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 md:grid-cols-3">
          {[
            [
              "Built for rush hour",
              "Tickets stream to the kitchen the moment a guest taps send. Item-level status so the pass never guesses.",
            ],
            [
              "Any country, local tax",
              "USD, GBP, EUR, AED, INR, and 20+ markets. VAT-inclusive or exclusive. You keep taking payment the way you already do.",
            ],
            [
              "No hardware lock-in",
              "Runs in Chrome, Safari, and as a PWA on a spare laptop or kitchen tablet. Cancel anytime. $29 / month.",
            ],
          ].map(([title, copy]) => (
            <article key={title} className="rise-in">
              <h2 className="display text-2xl">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="display text-3xl md:text-4xl">Everything a floor needs. Nothing it does not.</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["QR guest menu", "No app store. Scan, pick modifiers, send."],
            ["Kitchen display", "Color-coded clocks, chime, bump buttons."],
            ["Menu paste import", "Drop in the menu you already have."],
            ["Staff logins", "Owner, manager, floor, kitchen roles."],
            ["Daily close", "Take, average ticket, what sold, date range."],
            ["Trial that is real", "45 days. Card later. Read-only after, not locked out."],
            ["Works offline-ish", "Install as a PWA. Kitchen stays on the board."],
            ["Privacy by design", "No guest cards. No ad pixels. Restaurant controls guest tickets. DPA in the footer."],
            ["Audit trail", "Who accepted, rejected, or 86’d an item."],
          ].map(([title, copy]) => (
            <article key={title} className="card p-4">
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[#efe4cc]/60">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="display text-3xl">What owners say they want</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["Harbour & Rye", "London", "We stopped shouting modifiers across the pass. Tickets arrive as written."],
              ["Independent rooms", "Dubai · Mumbai · Austin", "One product, local tax and currency. Guests never download an app."],
              ["Kitchen first", "Anywhere", "If it is not readable from two metres at 8pm Saturday, it is not a KDS."],
            ].map(([who, where, quote]) => (
              <blockquote key={who} className="card p-5">
                <p className="text-sm leading-6">“{quote}”</p>
                <footer className="mt-4 text-xs uppercase tracking-widest text-[var(--ink-soft)]">
                  {who} · {where}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-5 py-16">
        <div className="card grid gap-8 p-8 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div>
            <h2 className="display text-3xl md:text-4xl">$29 / month. 45 days free.</h2>
            <p className="mt-3 max-w-xl text-[var(--ink-soft)]">
              One price billed in USD via Stripe. Guest card capture is out of the MVP on purpose —
              you keep the processor you already trust. Unlimited tables, tickets, and kitchen
              screens.
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              <li>✓ Real-time kitchen tickets</li>
              <li>✓ QR menus in the guest’s browser</li>
              <li>✓ Tax presets for 25+ countries</li>
              <li>✓ Cancel from settings. No hardware return.</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-[var(--ink)] p-6 text-[var(--ticket)]">
            <p className="text-xs uppercase tracking-[0.2em] text-[#c9b89a]">Starter</p>
            <p className="display mt-2 text-5xl">$29</p>
            <p className="text-sm text-[#c9b89a]">per venue / month</p>
            <Link href="/signup" className="btn btn-chili mt-6 w-full">
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
