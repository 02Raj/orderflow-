"use client";

import { BrandLink } from "@/components/brand";
import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Directory = "venues" | "users";
type Venue = {
  id: string; name: string; country: string; demo: boolean; subscription: string;
  users: number; recentOrders: number; lastOrderAt: string | null;
};
type User = {
  id: string; name: string; email: string; venueName: string; role: string;
  demo: boolean; enabled: boolean; lastLoginAt: string | null;
};
type Dashboard = {
  totals: { clients: number; activeVenues: number; users: number; enabledUsers: number; recentUsers: number; recentOrders: number };
  rows: (Venue | User)[];
  page: number;
  hasNext: boolean;
};

class AdminRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function adminRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, { ...options, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new AdminRequestError(data.message ?? "Request failed.", response.status);
  return data;
}

function dateLabel(date: string | null, empty: string) {
  return date ? new Date(date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : empty;
}

const columns = {
  venues: ["Venue", "Activity", "Orders (7 days)", "Users", "Subscription", "Last order"],
  users: ["User", "Venue", "Role", "Account", "Last sign-in"],
};

export function AdminPortal() {
  const [session, setSession] = useState<"checking" | "signed-out" | "signed-in">("checking");
  const [data, setData] = useState<Dashboard | null>(null);
  const [view, setView] = useState<Directory>("venues");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [venue, setVenue] = useState<Venue | null>(null);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signedOut = session === "signed-out";

  useEffect(() => {
    if (signedOut) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ view, q: query, status: filter, page: String(page), venue: venue?.id ?? "" });
    void adminRequest<Dashboard>(`dashboard?${params}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setSession("signed-in");
      }).catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (failure instanceof AdminRequestError && failure.status === 401) {
          setData(null);
          setSession("signed-out");
        } else {
          setError(failure instanceof AdminRequestError ? failure.message : "Could not load the dashboard.");
        }
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [signedOut, view, query, filter, page, venue, refresh]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await adminRequest("login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      setLoading(true);
      setSession("checking");
    } catch (failure) {
      setError(failure instanceof AdminRequestError ? failure.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await adminRequest("logout", { method: "POST" });
      setData(null);
      setSession("signed-out");
    } catch {
      setError("Could not sign out. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  function loadDirectory(nextView: Directory, nextVenue: Venue | null = null) {
    setView(nextView);
    setVenue(nextVenue);
    setSearch("");
    setQuery("");
    setFilter("");
    setPage(1);
    reload();
  }

  function reload() {
    setError("");
    setLoading(true);
    setRefresh((current) => current + 1);
  }

  const totals = data?.totals;
  const metrics = totals ? [
    ["Client venues", totals.clients, "Excludes the demo venue"],
    ["Active venues", totals.activeVenues, "Clients with an order in the last 7 days"],
    ["Orders in 7 days", totals.recentOrders, "Across client venues"],
    ["User accounts", totals.users, `${totals.enabledUsers.toLocaleString()} enabled · includes demo accounts`],
    ["Recent users", totals.recentUsers, "Enabled accounts signed in within 7 days"],
  ] as const : [];

  if (session === "signed-out") return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <BrandLink />
      <h1 className="display mt-8 text-4xl">Platform admin</h1>
      <form method="post" action="/api/admin/login" onSubmit={signIn} className="card mt-6 space-y-4 p-5">
        <label className="block text-sm font-semibold">Email
          <input required type="email" name="email" autoComplete="username" className="field mt-1" />
        </label>
        <label className="block text-sm font-semibold">Password
          <input required type="password" name="password" autoComplete="current-password" className="field mt-1" />
        </label>
        {error && <p role="alert" className="text-sm text-[var(--chili-dark)]">{error}</p>}
        <button disabled={busy} className="btn btn-ink w-full">{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <Link href="/login" className="mt-5 text-sm underline">Venue sign-in</Link>
    </main>
  );

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <BrandLink />
        {session === "signed-in" && <button type="button" disabled={busy} onClick={signOut} className="btn btn-ghost">Sign out</button>}
      </header>
      <h1 className="display mt-8 text-4xl">Platform admin</h1>
      {error && <p role="alert" className="mt-4 rounded-xl bg-[#f3d0c8] p-3">{error}</p>}
      {session === "checking" ? (
        <div className="mt-5">
          {loading ? <p role="status">Checking admin session…</p> : <button className="btn btn-ghost" onClick={reload}>Retry</button>}
        </div>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {metrics.map(([label, value, detail]) => (
              <div key={label} className="card p-4">
                <dt className="text-sm font-semibold">{label}</dt>
                <dd className="display my-1 text-3xl tabular-nums">{value.toLocaleString()}</dd>
                <dd className="text-xs text-[var(--ink-soft)]">{detail}</dd>
              </div>
            ))}
          </dl>
          <section className="card mt-6 p-4 sm:p-6" aria-label="Platform directory">
            <div className="flex flex-wrap justify-between gap-2">
              <div role="group" aria-label="Directory view" className="flex gap-2">
                {(["venues", "users"] as const).map((tab) => (
                  <button key={tab} aria-pressed={view === tab} className={`btn ${view === tab ? "btn-ink" : "btn-ghost"}`}
                    onClick={() => loadDirectory(tab)}>{tab === "venues" ? "Venues" : "Users"}</button>
                ))}
              </div>
              <button type="button" onClick={reload} className="btn btn-ghost">Refresh</button>
            </div>
            {venue && <p className="mt-4 text-sm">Users at <strong>{venue.name}</strong> · <button className="underline" onClick={() => loadDirectory("users")}>Show all venues</button></p>}
            <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(event) => {
              event.preventDefault();
              setQuery(search.trim());
              setPage(1);
              reload();
            }}>
              <label className="min-w-40 flex-1 text-sm font-medium">Search {view}
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
                  maxLength={120} placeholder={view === "venues" ? "Venue name or country" : "Name, email, role or venue"}
                  className="field mt-1" />
              </label>
              <label className="text-sm font-medium">Status
                <select value={filter} className="field mt-1" onChange={(event) => {
                  setFilter(event.target.value);
                  setPage(1);
                  reload();
                }}>
                  <option value="">All</option>
                  {view === "venues" ? <option value="active">Active in 7 days</option> : <>
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </>}
                </select>
              </label>
              <button className="btn btn-ink min-h-11">Search</button>
            </form>
            {loading ? <p className="py-6 text-sm" role="status">Loading {view}…</p> : error ? null : !data?.rows.length ? (
              <p className="py-6 text-sm">No matching {view}.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead><tr>{columns[view].map((column) => <th key={column} scope="col" className="p-3 text-[var(--ink-soft)]">{column}</th>)}</tr></thead>
                  <tbody>{data.rows.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--rule)] align-top">
                      {"email" in row ? <>
                        <td className="p-3"><strong>{row.name}</strong><br />{row.email}</td>
                        <td className="p-3">{row.venueName}{row.demo && " (Demo)"}</td>
                        <td className="p-3 capitalize">{row.role}</td>
                        <td className="p-3">{row.enabled ? "Enabled" : "Disabled"}</td>
                        <td className="p-3">{dateLabel(row.lastLoginAt, "No recorded sign-in")}</td>
                      </> : <>
                        <td className="p-3"><strong>{row.name}</strong>{row.demo && " (Demo)"}<br />{row.country}</td>
                        <td className="p-3">{row.recentOrders ? "Active" : "No recent orders"}</td>
                        <td className="p-3 tabular-nums">{row.recentOrders}</td>
                        <td className="p-3"><button onClick={() => loadDirectory("users", row)} className="underline">{row.users} users<span className="sr-only"> at {row.name}</span></button></td>
                        <td className="p-3 capitalize">{row.subscription.replaceAll("_", " ")}</td>
                        <td className="p-3">{dateLabel(row.lastOrderAt, "No orders")}</td>
                      </>}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <nav aria-label="Directory pagination" className="mt-4 flex items-center justify-end gap-2">
              <button className="btn btn-ghost" disabled={loading || page <= 1} onClick={() => { setPage(page - 1); reload(); }}>Previous</button>
              <span className="text-sm">Page {page}</span>
              <button className="btn btn-ghost" disabled={loading || !!error || !data?.hasNext} onClick={() => { setPage(page + 1); reload(); }}>Next</button>
            </nav>
          </section>
        </>
      )}
    </main>
  );
}
