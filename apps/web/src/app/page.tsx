import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-sm bg-[var(--chili)] font-[family-name:var(--font-serif)] text-sm text-[var(--ticket)]">
            OF
          </span>
          <strong className="tracking-tight">OrderFlow</strong>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/login" className="px-3 py-2 text-[var(--ink-soft)]">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-sm bg-[var(--ink)] px-4 py-2 text-[var(--ticket)]"
          >
            Start 45-day trial
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-8 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--chili)]">
            Restaurant order tickets, without the hardware tax
          </p>
          <h1
            className="mt-4 max-w-xl text-4xl leading-[1.05] md:text-6xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Guests scan. Kitchen sees. Tickets stop getting lost.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-7 text-[var(--ink-soft)]">
            OrderFlow is a browser POS for independent restaurants. Put a QR on each table. Orders
            land on a kitchen screen with modifiers, notes, and a running clock. No tablet
            contract. No proprietary terminal.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-sm bg-[var(--chili)] px-5 py-3 text-sm font-semibold text-[var(--ticket)]"
            >
              Open a venue in five minutes
            </Link>
            <Link href="/login" className="rounded-sm border border-[var(--ink)] px-5 py-3 text-sm">
              Try Harbour & Rye demo
            </Link>
          </div>
          <p className="mt-4 text-sm text-[var(--ink-soft)]">
            Demo login: <code>owner@harbourandrye.demo</code> / <code>harbour-demo</code>
          </p>
        </div>

        <div className="ticket-shadow rounded-sm bg-[var(--ticket)] p-5">
          <div className="flex items-center justify-between border-b border-dashed border-[var(--rule)] pb-3 text-xs uppercase tracking-widest text-[var(--ink-soft)]">
            <span>Kitchen · Table 4</span>
            <span className="text-[var(--chili)]">2:14</span>
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
            <span className="bg-[#f3d0c8] px-2 py-2">New</span>
            <span className="bg-[#f3e3b6] px-2 py-2">Firing</span>
            <span className="bg-[#cfe3d6] px-2 py-2">Pass</span>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--rule)] bg-[#efe4cc]">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-3">
          {[
            ["Lost tickets are revenue", "Printer drop-outs and verbal orders are still how many kitchens run. A missed modifier is wasted food and a walk-out."],
            ["Hardware is the lock-in", "Toast, Clover and Square make the software look cheap, then recover it in terminals, contracts and processing."],
            ["Setup has to beat a lunch rush", "If an owner cannot paste a menu, print QRs and open a kitchen board before service, they will not switch."],
          ].map(([title, copy]) => (
            <article key={title}>
              <h2 className="text-xl" style={{ fontFamily: "var(--font-serif)" }}>
                {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-3xl" style={{ fontFamily: "var(--font-serif)" }}>
          $29 / month. 45 days free. Card later.
        </h2>
        <p className="mt-3 max-w-2xl text-[var(--ink-soft)]">
          One price, any English-speaking market we can invoice in USD via Stripe. Guest card
          capture is out of the MVP on purpose — you keep taking payment the way you already do.
        </p>
      </section>
    </main>
  );
}
