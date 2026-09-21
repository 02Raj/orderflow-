"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { clearSession, getToken, getUser, SessionUser } from "@/lib/session";
import { BillingStatus, Restaurant } from "@/lib/types";
import { useOrderStream } from "@/lib/use-order-stream";
import { Icons } from "@/components/icons";

const NAV = [
  { href: "/app", label: "Floor", icon: Icons.floor, roles: ["owner", "manager", "staff"] },
  { href: "/app/orders", label: "Tickets", icon: Icons.tickets, roles: ["owner", "manager", "staff"] },
  { href: "/kitchen", label: "Kitchen", icon: Icons.kitchen, roles: ["owner", "manager", "staff", "kitchen"] },
  { href: "/app/menu", label: "Menu", icon: Icons.menu, roles: ["owner", "manager"] },
  { href: "/app/tables", label: "Tables", icon: Icons.tables, roles: ["owner", "manager"] },
  { href: "/app/reports", label: "Reports", icon: Icons.reports, roles: ["owner", "manager"] },
  { href: "/app/staff", label: "Staff", icon: Icons.staff, roles: ["owner"] },
  { href: "/app/settings", label: "Settings", icon: Icons.settings, roles: ["owner", "manager"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [ready, setReady] = useState(false);
  const stream = useOrderStream(true);
  const newCount = stream.orders.filter((o) => o.status === "new").length;

  useEffect(() => {
    const token = getToken();
    const session = getUser();
    if (!token || !session) {
      window.location.replace("/login");
      return;
    }
    setUser(session);
    let cancelled = false;
    Promise.all([
      api<Restaurant>("/restaurant", { token }),
      api<BillingStatus>("/billing/status", { token }),
    ])
      .then(([r, b]) => {
        if (cancelled) return;
        setRestaurant(r);
        setBilling(b);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="text-center">
          <div className="skeleton mx-auto h-10 w-10 rounded-full" />
          <p className="mt-3 text-sm text-[var(--ink-soft)]">Opening the floor…</p>
        </div>
      </div>
    );
  }

  const links = NAV.filter((item) => item.roles.includes(user.role));

  return (
    <div className="min-h-screen pb-20 md:grid md:grid-cols-[240px_1fr] md:pb-0">
      <aside className="border-b border-[var(--rule)] bg-[color-mix(in_srgb,var(--paper-2)_88%,white)] md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--chili)]">
              OrderFlow
            </p>
            <p className="mt-1 font-semibold leading-tight">{restaurant?.name}</p>
            <p className="text-xs capitalize text-[var(--ink-soft)]">
              {user.fullName} · {user.role}
            </p>
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
          <p className="mx-4 mb-3 rounded-[12px] border border-[#ead7a4] bg-[#fff4d6] px-3 py-2 text-xs">
            Trial · <strong>{billing.daysLeftInTrial} days left</strong> · {billing.priceLabel}
          </p>
        ) : null}
        {billing?.accessBlocked ? (
          <p className="mx-4 mb-3 rounded-[12px] bg-[#f3d0c8] px-3 py-2 text-xs">
            Trial ended. Ordering is paused.{" "}
            <Link href="/app/settings" className="font-semibold underline">
              Subscribe
            </Link>
          </p>
        ) : null}
        <nav className="hidden gap-1 px-3 pb-4 md:flex md:flex-col">
          {links.map((item) => {
            const active = pathname === item.href;
            const badge = item.href === "/app/orders" && newCount > 0;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded-[12px] px-3 py-2.5 text-sm transition ${
                  active ? "bg-[var(--ink)] text-[var(--ticket)]" : "hover:bg-white/70"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon size={16} />
                  {item.label}
                </span>
                {badge ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--chili)] px-1.5 text-[10px] text-white">
                    {newCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className="min-w-0">{children}</section>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t border-[var(--rule)] bg-[var(--ticket)]/95 px-2 py-2 backdrop-blur md:hidden">
        {links.slice(0, 4).map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl px-2 py-2 text-center text-[11px] ${
                active ? "bg-[var(--ink)] text-[var(--ticket)]" : "text-[var(--ink-soft)]"
              }`}
            >
              <div className="mx-auto mb-0.5 grid place-items-center">
                <Icon size={16} />
              </div>
              {item.label}
              {item.href === "/app/orders" && newCount > 0 ? (
                <span className="ml-1 text-[var(--chili)]">{newCount}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
