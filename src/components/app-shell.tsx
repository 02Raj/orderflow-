"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { clearSession, getToken, getUser, openLocation, reloadWhenSignInChanges, SessionUser } from "@/lib/session";
import { PAYMENTS_ENABLED } from "@/lib/payments";
import { BillingStatus, Restaurant, VenueLocation } from "@/lib/types";
import { useOrderStream } from "@/lib/use-order-stream";
import { playNewOrderSound, playReadyBellSound } from "@/lib/kitchen-sound";
import { Icons } from "@/components/icons";
import { OnboardingModal } from "@/components/onboarding-modal";
import { DemoTourModal } from "@/components/demo-tour-modal";

const NAV = [
  { href: "/app", label: "Floor", icon: Icons.floor, roles: ["owner", "manager", "staff"] },
  { href: "/app/take-order", label: "Take order", icon: Icons.tables, roles: ["owner", "manager", "staff"] },
  { href: "/app/orders", label: "Tickets", icon: Icons.tickets, roles: ["owner", "manager", "staff"] },
  { href: "/app/kitchen", label: "Kitchen", icon: Icons.kitchen, roles: ["owner", "manager", "staff", "kitchen"] },
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
  const [locations, setLocations] = useState<VenueLocation[]>([]);
  const [switching, setSwitching] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [ready, setReady] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [floorBell, setFloorBell] = useState(false);
  const moreDialog = useRef<HTMLDialogElement>(null);
  const { orders, setOnCreated, setOnStatusChange } = useOrderStream(true);
  const newCount = orders.filter((o) => o.status === "new").length;

  useEffect(reloadWhenSignInChanges, []);

  useEffect(() => {
    setOnCreated(() => {
      if (floorBell) playNewOrderSound();
    });
    setOnStatusChange((order) => {
      if (!floorBell) return;
      if (order.status === "ready" || order.status === "served") {
        playReadyBellSound();
      }
    });
  }, [floorBell, setOnCreated, setOnStatusChange]);

  useEffect(() => {
    const token = getToken();
    const session = getUser();
    if (!token || !session) {
      window.location.replace("/login");
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    if (session.role === "owner") {
      api<VenueLocation[]>("/auth/locations", { token, signal: controller.signal })
        .then(setLocations).catch(() => undefined);
    }
    Promise.all([
      api<Restaurant>("/restaurant", { token }),
      PAYMENTS_ENABLED
        ? api<BillingStatus>("/billing/status", { token })
        : Promise.resolve(null),
    ])
      .then(([r, b]) => {
        if (cancelled) return;
        setRestaurant(r);
        setBilling(b);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setUser(session);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (!ready || !user) {
    return (
      <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-[var(--rule)] bg-[color-mix(in_srgb,var(--paper-2)_88%,white)] p-4 md:block">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton mt-2 h-5 w-36" />
          <div className="skeleton mt-1.5 h-3 w-28" />
          <div className="mt-8 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-10 w-full rounded-[12px]" />
            ))}
          </div>
        </aside>
        <section className="p-6 md:p-8">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton mt-2 h-10 w-56" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-28 rounded-2xl" />
            ))}
          </div>
        </section>
      </div>
    );
  }

  const links = NAV.filter((item) => item.roles.includes(user.role));
  const moreLinks = links.slice(4);

  async function switchLocation(id: string) {
    if (switching) return;
    setSwitching(true);
    setLocationError("");
    try {
      await openLocation(id);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "Could not switch locations.");
      setSwitching(false);
    }
  }

  return (
    <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] md:grid md:grid-cols-[240px_1fr] md:pb-0">
      <aside className="border-b border-[var(--rule)] bg-[color-mix(in_srgb,var(--paper-2)_88%,white)] md:sticky md:top-0 md:h-screen md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--chili)]">
              OrderNFlow
            </p>
            <p className="mt-1 font-semibold leading-tight">{restaurant?.name}</p>
            <p className="text-xs capitalize text-[var(--ink-soft)]">
              {user.fullName} · {user.role}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:mt-4">
            <button
              className="text-xs underline"
              onClick={() => {
                clearSession();
                router.push("/");
              }}
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={() => setTourOpen(true)}
              className="text-xs font-semibold text-[var(--chili-dark)] underline"
            >
              Guided tour
            </button>
            <button
              type="button"
              onClick={() => {
                if (!floorBell) {
                  setFloorBell(true);
                  playReadyBellSound();
                } else {
                  setFloorBell(false);
                }
              }}
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                floorBell
                  ? "bg-[#cfe3d6] text-[var(--sage)]"
                  : "border border-[var(--rule)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
              title="Ring a bell when kitchen marks an order Ready"
            >
              {floorBell ? "Pass bell on" : "Pass bell off"}
            </button>
          </div>
        </div>
        {user.role === "owner" && (
          <div className="mx-4 mb-3">
            {locations.length > 1 && (
              <label className="block text-xs font-semibold">
                Active location
                <select className="field mt-1" value={user.restaurantId} disabled={switching}
                  onChange={(event) => void switchLocation(event.target.value)}>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </label>
            )}
            {locationError && <p role="alert" className="mt-1 text-xs text-[var(--chili-dark)]">{locationError}</p>}
            {user.email !== "owner@harbourandrye.demo" && (
              <Link href="/app/locations" className="mt-2 inline-block text-xs font-semibold underline">Manage locations</Link>
            )}
          </div>
        )}
        {PAYMENTS_ENABLED && billing && !billing.accessBlocked && billing.status === "trialing" ? (
          <p className="mx-4 mb-3 rounded-[12px] border border-[#ead7a4] bg-[#fff4d6] px-3 py-2 text-xs">
            Trial · <strong>{billing.daysLeftInTrial} days left</strong> · {billing.priceLabel}
          </p>
        ) : null}
        {PAYMENTS_ENABLED && billing?.accessBlocked ? (
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
                aria-current={active ? "page" : undefined}
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
      <section className="min-w-0">
        <OnboardingModal />
        <DemoTourModal
          userEmail={user.email}
          externalOpen={tourOpen}
          onExternalClose={() => setTourOpen(false)}
        />
        {children}
      </section>
      <nav aria-label="Main navigation" className={`fixed inset-x-0 bottom-0 z-30 grid ${moreLinks.length ? "grid-cols-5" : "grid-cols-4"} gap-1 border-t border-[var(--rule)] bg-[var(--ticket)]/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden`}>
        {links.slice(0, 4).map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`min-h-11 rounded-xl px-1 py-2 text-center text-[11px] ${
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
        {moreLinks.length ? <button type="button" aria-haspopup="dialog" aria-controls="mobile-more"
          className={`min-h-11 rounded-xl px-1 py-2 text-center text-[11px] ${moreLinks.some((item) => item.href === pathname) ? "bg-[var(--ink)] text-[var(--ticket)]" : "text-[var(--ink-soft)]"}`}
          onClick={() => moreDialog.current?.showModal()}>
          <Icons.menu size={16} className="mx-auto mb-0.5" />
          More
        </button> : null}
      </nav>
      {moreLinks.length ? <dialog id="mobile-more" ref={moreDialog} aria-labelledby="mobile-more-title"
        className="card fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-b-none p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-[var(--ink)] backdrop:bg-black/50">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="mobile-more-title" className="display text-2xl">More</h2>
          <button type="button" className="btn btn-ghost min-h-11" onClick={() => moreDialog.current?.close()}>Close</button>
        </div>
        <nav aria-label="More pages" className="grid gap-1">
          {moreLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
              onClick={() => moreDialog.current?.close()}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm ${pathname === href ? "bg-[var(--ink)] text-[var(--ticket)]" : "bg-[var(--paper)]"}`}>
              <Icon size={18} />{label}
            </Link>
          ))}
        </nav>
      </dialog> : null}
    </div>
  );
}
