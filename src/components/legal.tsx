import Link from "next/link";
import { ReactNode } from "react";
import { MAIL, SITE_DOMAIN } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--rule)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-[var(--ink-soft)]">
        <span>
          © {new Date().getFullYear()} OrderFlow · {SITE_DOMAIN} · We do not sell guest or venue
          data
        </span>
        <nav className="flex flex-wrap gap-4">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/dpa">DPA</Link>
          <Link href="/security">Security</Link>
          <a href={`mailto:${MAIL.privacy}`}>{MAIL.privacy}</a>
        </nav>
      </div>
    </footer>
  );
}

export function LegalLayout({
  title,
  kicker,
  updated,
  children,
}: {
  title: string;
  kicker: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/" className="text-sm text-[var(--ink-soft)]">
          ← OrderFlow
        </Link>
      </header>
      <article className="mx-auto max-w-3xl px-5 pb-20">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--chili)]">
          {kicker}
        </p>
        <h1 className="display mt-2 text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">Last updated {updated}</p>
        <div className="legal-prose mt-8 space-y-4 text-sm leading-7 text-[var(--ink)]">{children}</div>
      </article>
      <SiteFooter />
    </main>
  );
}
