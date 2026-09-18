"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { clearSession, getToken, getUser, SessionUser } from "@/lib/session";
import { BillingStatus, Restaurant } from "@/lib/types";

const NAV = [
  { href: "/app", label: "Floor", roles: ["owner", "manager", "staff"] },
  { href: "/app/orders", label: "Tickets", roles: ["owner", "manager", "staff"] },
  { href: "/kitchen", label: "Kitchen", roles: ["owner", "manager", "staff", "kitchen"] },
  { href: "/app/menu", label: "Menu", roles: ["owner", "manager"] },
  { href: "/app/tables", label: "Tables / QR", roles: ["owner", "manager"] },
  { href: "/app/reports", label: "Close", roles: ["owner", "manager"] },
  { href: "/app/staff", label: "Staff", roles: ["owner"] },
  { href: "/app/settings", label: "Settings", roles: ["owner", "manager"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    const session = getUser();
    if (!token || !session) {
      router.replace("/login");
      return;
    }
    setUser(session);
    Promise.all([
      api<Restaurant>("/restaurant", { token }),
      api<BillingStatus>("/billing/status", { token }),
    ])
      .then(([r, b]) => {
        setRestaurant(r);
        setBilling(b);
      })
      .finally(() => setReady(true));
  }, [router]);

  if (!ready || !user) {
    return <div className="grid min-h-screen place-items-center text-sm text-[var(--ink-soft)]">Opening the floor…</div>;
  }

  const links = NAV.filter((item) => item.roles.includes(user.role));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-[var(--rule)] bg-[#efe4cc] md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--chili)]">
              OrderFlow
            </p>
            <p className="mt-1 font-semibold leading-tight">{restaurant?.name}</p>
            <p className="text-xs text-[var(--ink-soft)]">{user.fullName} · {user.role}</p>
          </div>
          <button
            className="text-xs underline md:mt-4"
            onClick={() => {
              clearSession();
              router.push("/");
            }}
          >
            Sign out
          </button>
        </div>
        {billing && !billing.accessBlocked && billing.status === "trialing" ? (
          <p className="mx-4 mb-3 rounded-sm bg-[var(--ticket)] px-3 py-2 text-xs">
            Trial · {billing.daysLeftInTrial} days left · {billing.priceLabel}
          </p>
        ) : null}
        {billing?.accessBlocked ? (
          <p className="mx-4 mb-3 rounded-sm bg-[#f3d0c8] px-3 py-2 text-xs">
            Trial ended. Ordering is paused.{" "}
            <Link href="/app/settings" className="underline">
              Subscribe
            </Link>
          </p>
        ) : null}
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible md:px-3">
          {links.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap px-3 py-2 text-sm ${active ? "bg-[var(--ink)] text-[var(--ticket)]" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
