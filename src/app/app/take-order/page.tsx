"use client";

import { ModifierPicker } from "@/components/modifier-picker";
import { modifierSelectionError } from "@/lib/modifiers";

import { PageHeader } from "@/components/ui";
import { ThermalPrintSheet } from "@/components/thermal-print-sheet";
import { ApiError, api, formatMoney } from "@/lib/api";
import { getToken } from "@/lib/session";
import { computeTotals } from "@/lib/tax";
import type { DiningTable, MenuCategory, MenuItem, Order, Restaurant } from "@/lib/types";
import { isAwaitingKitchen, syncIsStale, ticketStatusLabel, useNow } from "@/lib/use-order-stream";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface Line {
  key: string;
  item: MenuItem;
  quantity: number;
  modifierIds: string[];
}

interface StaffAttempt {
  clientRef: string;
  tableId?: string | null;
  fulfillmentType: "dine_in" | "takeaway";
  customerLabel?: string;
  note?: string;
  lines: { menuItemId: string; quantity: number; modifierIds: string[] }[];
}

const PENDING_KEY = "orderflow:staff-pending";

function optionCost(item: MenuItem, ids: string[]) {
  return item.modifiers.reduce((sum, option) => sum + (ids.includes(option.id) ? option.priceAdjustmentMinor : 0), 0);
}

export default function TakeOrderPage() {
  const [venue, setVenue] = useState<Restaurant | null>(null);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tableId, setTableId] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<"dine_in" | "takeaway">("dine_in");
  const [lines, setLines] = useState<Line[]>([]);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [modifiers, setModifiers] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [pendingAttempt, setPendingAttempt] = useState<StaffAttempt | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<Order | null>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [lastTicketSync, setLastTicketSync] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const sending = useRef(false);
  const now = useNow();
  const sentId = sent?.id;
  const tracking = sent && ["new", "accepted", "preparing", "ready"].includes(sent.status);
  const ticketSyncDelayed = tracking && syncIsStale(lastTicketSync, now);

  useEffect(() => {
    const token = getToken();
    if (!token || !sentId || !tracking) return;
    const controller = new AbortController();
    let timer: number;
    async function refresh() {
      try {
        const order = await api<Order>(`/orders/${sentId}`, {
          token,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        });
        if (controller.signal.aborted) return;
        setSent((previous) => previous?.id === order.id ? order : previous);
        setLastTicketSync(Date.now());
      } catch {
        // Keep the last known ticket visible while the request is retried.
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, 3000);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [sentId, tracking]);

  useEffect(() => {
    const saved = sessionStorage.getItem(PENDING_KEY);
    if (saved) {
      try {
        const attempt = JSON.parse(saved) as StaffAttempt;
        // Restore the browser-only retry payload once hydration has finished.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPendingAttempt(attempt);
      } catch { sessionStorage.removeItem(PENDING_KEY); }
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    const options = { token, signal: controller.signal };
    Promise.all([
      api<Restaurant>("/restaurant", options),
      api<DiningTable[]>("/tables", options),
      api<{ categories: MenuCategory[]; items: MenuItem[] }>("/menu", options),
    ]).then(([restaurant, dining, menu]) => {
      if (controller.signal.aborted) return;
      setVenue(restaurant);
      setTables(dining.filter((table) => table.isActive));
      setCategories(menu.categories);
      setItems(menu.items.filter((item) => item.isAvailable));
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError("Could not load tables and menu.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    const modal = dialog.current;
    if (selected && modal && !modal.open) modal.showModal();
  }, [selected]);

  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + (line.item.priceMinor + optionCost(line.item, line.modifierIds)) * line.quantity, 0);
  const totals = computeTotals(subtotal, { taxRateBp: venue?.taxRateBp ?? 0, taxInclusive: venue?.taxInclusive ?? false });
  const money = (minor: number) => formatMoney(minor, venue?.currency ?? "USD", venue?.locale);
  const activeFulfillmentType = pendingAttempt?.fulfillmentType ?? fulfillmentType;
  const currentTable = tables.find((table) => table.id === (pendingAttempt?.tableId ?? tableId));
  const tableAreas = [...new Set(tables.map((table) => table.area))];
  const normalize = (value: string) => value.toLocaleLowerCase(venue?.locale).normalize("NFD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1");
  const searchTerm = normalize(search.trim());
  const uncategorized = "uncategorized";
  const groups = [...categories, { id: uncategorized, name: "Other dishes" }].map((category) => ({
    ...category,
    items: items.filter((item) => (item.categoryId ?? uncategorized) === category.id),
  })).filter((category) => category.items.length > 0);
  const visibleGroups = groups
    .filter((category) => searchTerm || !categoryFilter || category.id === categoryFilter)
    .map((category) => ({ ...category, items: category.items.filter((item) => normalize(`${item.name} ${item.description ?? ""}`).includes(searchTerm)) }))
    .filter((category) => category.items.length > 0);

  function addItem(item: MenuItem, ids: string[]) {
    const key = `${item.id}:${ids.slice().sort().join(",")}`;
    setLines((current) => {
      const found = current.find((line) => line.key === key);
      return found
        ? current.map((line) => line.key === key ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line)
        : [...current, { key, item, quantity: 1, modifierIds: ids }];
    });
  }

  function changeQuantity(key: string, delta: number) {
    setLines((current) => current
      .map((line) => line.key === key ? { ...line, quantity: line.quantity + delta } : line)
      .filter((line) => line.quantity > 0));
  }

  async function send() {
    const token = getToken();
    const destinationReady = fulfillmentType === "takeaway" ? !!customerLabel.trim() : !!currentTable;
    if (!token || sending.current || (!pendingAttempt && (!destinationReady || !lines.length))) return;
    const request: StaffAttempt = pendingAttempt ?? {
      clientRef: crypto.randomUUID(),
      tableId: fulfillmentType === "dine_in" ? tableId : null,
      fulfillmentType,
      customerLabel: customerLabel || undefined,
      note: note || undefined,
      lines: lines.map((line) => ({
        menuItemId: line.item.id,
        quantity: line.quantity,
        modifierIds: line.modifierIds,
      })),
    };
    setPendingAttempt(request);
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(request));
      const order = await api<Order>("/orders", {
        method: "POST",
        token,
        json: request,
      });
      sessionStorage.removeItem(PENDING_KEY);
      setSent(order);
      setLastTicketSync(Date.now());
      setLines([]);
      setTableId("");
      setSearch("");
      setCategoryFilter(null);
      setNote("");
      setCustomerLabel("");
      setPendingAttempt(null);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
        sessionStorage.removeItem(PENDING_KEY);
        setPendingAttempt(null);
        setError(err.message);
      } else {
        setError(`${err instanceof Error ? err.message : "Could not confirm order"}. Retry sends the same ticket.`);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const finishPrinting = useCallback(() => setPrintOrder(null), []);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <PageHeader kicker="Floor" title="Take an order" />
        {loadError ? <div className="card mt-5 flex flex-wrap items-center gap-3 p-4">
          <p role="alert">{loadError}</p>
          <button type="button" className="btn btn-ghost min-h-11" onClick={() => {
            setLoading(true);
            setLoadError("");
            setLoadAttempt((attempt) => attempt + 1);
          }}>Try again</button>
        </div> : null}

        {loading ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
            <div className="space-y-4">
              <div className="skeleton h-16 rounded-2xl" />
              <div className="skeleton h-11 rounded-xl" />
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-16 rounded-2xl" />
                ))}
              </div>
            </div>
            <div className="skeleton h-72 rounded-2xl" />
          </div>
        ) : (
        <>
        <div className="card mt-5 flex flex-wrap items-end justify-between gap-4 p-4">
          <div className="inline-flex rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-1" aria-label="Order type">
            <button type="button" aria-pressed={activeFulfillmentType === "dine_in"} disabled={!!pendingAttempt}
              className={`btn min-h-10 ${activeFulfillmentType === "dine_in" ? "btn-ink" : ""}`}
              onClick={() => setFulfillmentType("dine_in")}>Dine in</button>
            <button type="button" aria-pressed={activeFulfillmentType === "takeaway"} disabled={!!pendingAttempt}
              className={`btn min-h-10 ${activeFulfillmentType === "takeaway" ? "btn-ink" : ""}`}
              onClick={() => { setFulfillmentType("takeaway"); setTableId(""); }}>Takeaway</button>
          </div>
          {activeFulfillmentType === "dine_in" ? <label className="min-w-56 flex-1 max-w-sm text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">Table
            <select id="table-picker" className="field mt-1 min-h-11 text-sm text-[var(--ink)]" value={currentTable?.id ?? ""} disabled={loading || !!loadError || !!pendingAttempt || tables.length === 0}
              onChange={(e) => setTableId(e.target.value)}>
              <option value="">{tables.length > 0 ? "Choose a table" : "No active tables"}</option>
              {tableAreas.filter((area) => area !== null).map((area) => (
                <optgroup key={area} label={area}>
                  {tables.filter((table) => table.area === area).map((table) => <option key={table.id} value={table.id}>Table {table.tableNumber}{table.label ? ` · ${table.label}` : ""}</option>)}
                </optgroup>
              ))}
              {tables.filter((table) => table.area === null).map((table) => <option key={table.id} value={table.id}>Table {table.tableNumber}{table.label ? ` · ${table.label}` : ""}</option>)}
            </select>
          </label> : <label className="min-w-56 flex-1 max-w-sm text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">Pickup name
            <input id="pickup-name" className="field mt-1 min-h-11 text-sm text-[var(--ink)]" value={customerLabel} disabled={!!pendingAttempt}
              placeholder="e.g. Alex (ticket # becomes token)" autoComplete="off" onChange={(event) => setCustomerLabel(event.target.value)} />
          </label>}
        </div>
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
          <section className="min-w-0" aria-label="Menu">
            <div className="sticky top-0 z-10 -mx-4 bg-[var(--paper)] px-4 py-2 sm:mx-0 sm:rounded-xl sm:px-0 lg:static">
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">Search dishes
                  <input id="dish-search" type="search" className="field mt-1 min-h-11 text-sm text-[var(--ink)]" placeholder="Search the menu" value={search}
                    disabled={loading || !!loadError || !!pendingAttempt} onChange={(e) => setSearch(e.target.value)} />
                </label>
                <a href="#current-ticket" className="btn btn-ink min-h-11 shrink-0 lg:hidden">
                  Ticket{count > 0 ? ` (${count})` : ""}
                </a>
              </div>
            </div>
            {!searchTerm && groups.length > 1 ? <div aria-label="Menu categories" className="my-3 flex flex-wrap gap-2">
              {[{ id: null, name: "All dishes" }, ...groups].map((category) => (
                <button key={category.id ?? "all"} type="button" aria-pressed={categoryFilter === category.id}
                  className={`btn min-h-11 scroll-mt-24 ${categoryFilter === category.id ? "btn-ink" : "border border-[var(--rule)] bg-[var(--ticket)]"}`}
                  onClick={() => setCategoryFilter(category.id)}>{category.name}</button>
              ))}
            </div> : null}
            {!loading && !loadError && visibleGroups.length === 0 ? <div className="card mt-3 p-4 text-sm" role="status">
              {searchTerm ? "No matching dishes. Try a shorter search." : "There are no available dishes on the menu."}
            </div> : null}
            <div className="mt-3 space-y-6">
              {visibleGroups.map((group) => <section key={group.id}>
                <h2 className="display mb-2 text-xl font-semibold">{group.name}</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => <button key={item.id} type="button" disabled={!!pendingAttempt}
                    className="card flex min-h-16 scroll-mt-24 items-start justify-between gap-3 p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                    onClick={() => {
                      if (item.modifiers.length || item.modifierGroups?.length) {
                        setSelected(item);
                        setModifiers([]);
                      } else addItem(item, []);
                    }}>
                    <span className="min-w-0 break-words"><strong className="block">{item.name}</strong>
                      {item.modifiers.length || item.modifierGroups?.length ? <small className="text-[var(--ink-soft)]">Choose options</small> : null}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{money(item.priceMinor)}</span>
                  </button>)}
                </div>
              </section>)}
            </div>
          </section>
          <aside id="current-ticket" tabIndex={-1} aria-labelledby="ticket-heading" className="card min-w-0 p-4 sm:p-5 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="ticket-heading" className="display text-2xl">Current ticket</h2>
              <a href="#dish-search" className="py-2 text-sm underline lg:hidden">Back to dishes</a>
            </div>
            <p className="mt-1 text-sm text-[var(--ink-soft)]" aria-live="polite">
              {activeFulfillmentType === "takeaway"
                ? customerLabel.trim() ? `Takeaway · ${customerLabel.trim()}` : "Takeaway · pickup name needed"
                : currentTable ? `Table ${currentTable.tableNumber}${currentTable.label ? ` · ${currentTable.label}` : ""}` : "No table selected"}
              {count > 0 ? ` · ${count} ${count === 1 ? "item" : "items"}` : ""}
            </p>
            {error ? <p className="mt-3 rounded-xl bg-[#f3d0c8] p-3 text-sm" role="alert">{error}</p> : null}
            {sent ? <div className="mt-3 rounded-xl border border-[var(--rule)] p-3 text-sm">
              <p role="status">
                <strong>Ticket #{sent.orderNumber} · {sent.fulfillmentType === "takeaway" ? `Takeaway · ${sent.customerLabel}` : `Table ${sent.tableNumber}`}</strong>
                {" — "}{ticketSyncDelayed ? `${ticketStatusLabel(sent.status)} (last known)` : ticketStatusLabel(sent.status)}
                {sent.status === "cancelled" && sent.rejectionReason ? ` — ${sent.rejectionReason}` : ""}
              </p>
              {ticketSyncDelayed ? <p role="alert" className="mt-1 text-[var(--chili)]">Status sync is delayed. Check with the kitchen.</p>
                : isAwaitingKitchen(sent, now) ? <p role="alert" className="mt-1 text-[var(--chili)]">Still awaiting acceptance. Check with the kitchen.</p> : null}
              <div className="mt-1 flex flex-wrap gap-x-4">
                <Link href="/app" className="inline-flex min-h-11 items-center underline">View floor tickets</Link>
                <button type="button" className="inline-flex min-h-11 items-center underline" onClick={() => setPrintOrder(sent)}>Print bill</button>
                {!count && !pendingAttempt ? <a href="#table-picker" className="inline-flex min-h-11 items-center underline">Start next ticket</a> : null}
              </div>
            </div> : null}
            {pendingAttempt && !busy ? <p className="mt-3 rounded-xl bg-[#fff4d6] p-3 text-sm" role="status">
              Confirmation pending. Check with the kitchen before writing this ticket on paper. Use Retry to check the same ticket when you reconnect.
            </p> : null}
            {!pendingAttempt && count === 0 ? <p className="mt-3 text-sm text-[var(--ink-soft)]">Tap a dish to add it.</p> : null}
            <ul className="mt-3 space-y-3">
              {lines.map((line) => <li key={line.key} className="border-b border-[var(--rule)] pb-3 text-sm">
                <div className="flex justify-between gap-2"><strong>{line.item.name}</strong>
                  <span className="shrink-0 tabular-nums">{money((line.item.priceMinor + optionCost(line.item, line.modifierIds)) * line.quantity)}</span></div>
                {line.modifierIds.length ? <p className="text-xs text-[var(--ink-soft)]">{line.item.modifiers.filter((mod) => line.modifierIds.includes(mod.id)).map((mod) => mod.name).join(", ")}</p> : null}
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" className="btn btn-ghost size-11 p-0" disabled={!!pendingAttempt} onClick={() => changeQuantity(line.key, -1)} aria-label={`Remove one ${line.item.name}`}>−</button>
                  <span>{line.quantity}</span>
                  <button type="button" className="btn btn-ghost size-11 p-0" disabled={!!pendingAttempt || line.quantity >= 99} onClick={() => changeQuantity(line.key, 1)} aria-label={`Add one ${line.item.name}`}>+</button>
                </div>
              </li>)}
            </ul>
            {count > 0 && <>
              <details className="mt-3">
                <summary className="cursor-pointer py-3 text-sm font-semibold">{activeFulfillmentType === "takeaway" ? "Kitchen note" : "Guest name and kitchen note"}</summary>
                {activeFulfillmentType === "dine_in" ? <label className="block text-sm">Guest name <span className="text-[var(--ink-soft)]">(optional)</span>
                  <input className="field mt-1" value={customerLabel} disabled={!!pendingAttempt} onChange={(e) => setCustomerLabel(e.target.value)} />
                </label> : null}
                <label className="mt-2 block text-sm">Kitchen note <span className="text-[var(--ink-soft)]">(optional)</span>
                  <textarea className="field mt-1" rows={2} value={note} disabled={!!pendingAttempt} onChange={(e) => setNote(e.target.value)} />
                </label>
              </details>
              {totals.taxMinor > 0 && !venue?.taxInclusive ? <p className="mt-2 flex justify-between gap-2 text-sm text-[var(--ink-soft)]">
                <span>Subtotal</span><span>{money(totals.subtotalMinor)}</span>
              </p> : null}
              {totals.taxMinor > 0 ? <p className="mt-2 flex justify-between gap-2 text-sm text-[var(--ink-soft)]">
                <span>{venue?.taxLabel}{venue?.taxInclusive ? " included" : ""}</span><span>{money(totals.taxMinor)}</span>
              </p> : null}
              <p className="mt-2 flex justify-between gap-2 font-semibold"><span>Ticket total</span><span>{money(totals.totalMinor)}</span></p>
              {activeFulfillmentType === "dine_in" && !currentTable && !pendingAttempt ? <a href="#table-picker" className="mt-3 inline-block py-2 text-sm underline">Choose a table to send this ticket</a> : null}
              {activeFulfillmentType === "takeaway" && !customerLabel.trim() && !pendingAttempt ? <a href="#pickup-name" className="mt-3 inline-block py-2 text-sm underline">Add a pickup name to send this ticket</a> : null}
            </>}
            <button type="button" className="btn btn-chili mt-4 min-h-11 w-full py-3" disabled={busy || (!pendingAttempt && (!count || (activeFulfillmentType === "dine_in" ? !currentTable : !customerLabel.trim())))} onClick={send}>
              {busy ? "Sending…" : pendingAttempt ? "Retry same ticket" : activeFulfillmentType === "takeaway" ? "Send takeaway to kitchen" : currentTable ? `Send Table ${currentTable.tableNumber} to kitchen` : "Send to kitchen"}
            </button>
          </aside>
        </div>
        {selected ? <dialog ref={dialog} onClose={() => setSelected(null)} aria-labelledby="dish-options-heading"
          className="card fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto p-5 text-[var(--ink)] backdrop:bg-black/50">
            <h2 id="dish-options-heading" className="display text-2xl">{selected.name}</h2>
            {selected.description ? <p className="mt-2 text-sm text-[var(--ink-soft)]">{selected.description}</p> : null}
            <div className="mt-4 space-y-3">
              <ModifierPicker item={selected} selected={modifiers} onChange={setModifiers} money={money} />
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" className="btn btn-ghost min-h-11" onClick={() => dialog.current?.close()}>Cancel</button>
              <button type="button" disabled={!!modifierSelectionError(selected.modifierGroups ?? [], selected.modifiers, modifiers)} className="btn btn-ink min-h-11 flex-1" onClick={() => { addItem(selected, modifiers); dialog.current?.close(); }}>
                Add item · {money(selected.priceMinor + optionCost(selected, modifiers))}
              </button>
            </div>
        </dialog> : null}
        <ThermalPrintSheet order={printOrder} restaurant={venue} kind="bill" onDone={finishPrinting} />
        </>
        )}
      </div>
  );
}
