"use client";

import { EmptyState, PageHeader } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { getToken } from "@/lib/session";
import type { DiningTable, Restaurant } from "@/lib/types";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";

function nextTableNumber(tables: DiningTable[]) {
  const used = new Set(tables.map((table) => table.tableNumber));
  let number = 1;
  while (used.has(number)) number++;
  return number;
}

function TableQr({ table, guestUrl }: { table: DiningTable; guestUrl: string }) {
  const [image, setImage] = useState("");
  const [qrError, setQrError] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const localOnly = ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(new URL(guestUrl).hostname);

  useEffect(() => {
    let current = true;
    QRCode.toDataURL(guestUrl, { width: 1024, margin: 4, errorCorrectionLevel: "M" })
      .then((data) => { if (current) setImage(data); })
      .catch(() => { if (current) setQrError(true); });
    return () => { current = false; };
  }, [guestUrl]);

  return <div className="mt-4 border-t border-[var(--rule)] pt-4">
    {localOnly ? <p className="mb-3 rounded-xl bg-[#fff4d6] p-3 text-sm">
      This is a local test QR. Open this dashboard on your venue’s public domain before printing guest signs.
    </p> : null}
    {image ? <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={`Guest QR for table ${table.tableNumber}`} width={192} height={192} className="mx-auto rounded-xl border border-[var(--rule)]" />
    </> : <p className="text-sm" role={qrError ? "alert" : "status"}>{qrError ? "Could not generate the QR image. The guest link is still available." : "Generating QR…"}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <a className="btn btn-ink min-h-11" href={guestUrl} target="_blank" rel="noopener noreferrer">Preview guest menu</a>
      {image ? <a className="btn btn-ghost min-h-11" href={image} download={`table-${table.tableNumber}-qr.png`}>Download QR</a> : null}
    </div>
    <label className="mt-4 block text-sm font-semibold">Guest link
      <input type="url" readOnly value={guestUrl} className="field mt-1" onFocus={(event) => event.currentTarget.select()} />
    </label>
    <button type="button" className="btn btn-ghost mt-2 min-h-11" onClick={async () => {
      try {
        await navigator.clipboard.writeText(guestUrl);
        setCopyStatus("Link copied.");
      } catch {
        setCopyStatus("Select the guest link to copy it manually.");
      }
    }}>Copy link</button>
    {copyStatus ? <span className="ml-2 text-sm" role="status">{copyStatus}</span> : null}
  </div>;
}

export default function TablesPage() {
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [origin, setOrigin] = useState("");
  const [number, setNumber] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [area, setArea] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmation, setConfirmation] = useState<"rotate" | "deactivate" | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback((signal?: AbortSignal) => {
    const token = getToken();
    if (!token) return;
    return Promise.all([
      api<DiningTable[]>("/tables", { token, signal }),
      api<Restaurant>("/restaurant", { token, signal }),
    ]).then(([rows, venue]) => {
      if (signal?.aborted) return;
      setTables(rows);
      setRestaurant(venue);
      setOrigin(window.location.origin);
      setLoadError("");
    }).catch((error) => {
      if (!signal?.aborted) setLoadError(error instanceof Error ? error.message : "Could not load tables.");
    }).finally(() => {
      if (!signal?.aborted) setLoading(false);
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const selected = tables.find((table) => table.id === selectedId);
  const areas = [...new Set(tables.flatMap((table) => table.area ? [table.area] : []))].sort((a, b) => a.localeCompare(b, restaurant?.locale));
  const visible = areaFilter ? tables.filter((table) => (table.area ? `area:${table.area}` : "none") === areaFilter) : tables;
  const suggested = nextTableNumber(tables);
  const numberValue = number ?? String(suggested);

  function saveRow(row: DiningTable) {
    setTables((current) => [...current.filter((entry) => entry.id !== row.id), row].sort((a, b) => a.tableNumber - b.tableNumber));
  }

  function selectTable(id: string | null) {
    setSelectedId(id);
    setConfirmation(null);
    setActionError("");
    setNotice("");
    setEditing(false);
    setNumber(null);
    setLabel("");
    setArea("");
  }

  async function saveTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getToken();
    if (!token || busy) return;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const updating = editing && selected;
      const row = await api<DiningTable>(updating ? `/tables/${selected.id}` : "/tables", {
        method: updating ? "PATCH" : "POST",
        token,
        json: { tableNumber: Number(numberValue), label, area },
      });
      saveRow(row);
      selectTable(row.id);
      if (areaFilter && areaFilter !== (row.area ? `area:${row.area}` : "none")) setAreaFilter("");
      setNotice(updating ? `Table ${row.tableNumber} updated.` : `Table ${row.tableNumber} added. Its guest QR is ready.`);
    } catch (error) {
      if (!editing && error instanceof ApiError && error.status === 409) {
        setNumber(numberValue);
        await load();
      }
      setActionError(error instanceof Error ? error.message : "Could not save the table.");
    } finally {
      setBusy(false);
    }
  }

  async function changeTable(action: "rotate" | "deactivate" | "activate") {
    const token = getToken();
    if (!token || busy || !selected) return;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      if (action === "rotate") {
        const result = await api<{ qrToken: string }>(`/tables/${selected.id}/rotate`, { method: "POST", token });
        saveRow({ ...selected, qrToken: result.qrToken });
        setNotice("QR replaced. Download and print the new code for this table.");
      } else {
        const isActive = action === "activate";
        saveRow(await api<DiningTable>(`/tables/${selected.id}`, { method: "PATCH", token, json: { isActive } }));
        setNotice(isActive ? "Table active. Its existing QR works again." : "Table inactive. Its QR is paused.");
      }
      setConfirmation(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update the table.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <PageHeader title="Tables & QR" copy="Organize tables by area and set up a guest QR for each table." />
    {loading ? <p className="mt-5 text-sm" role="status">Loading tables…</p> : null}
    {loadError ? <div className="card mt-5 flex flex-wrap items-center gap-3 p-4">
      <p role="alert">{loadError}</p>
      <button type="button" className="btn btn-ghost min-h-11" disabled={loading} onClick={() => { setLoading(true); void load(); }}>Try again</button>
    </div> : null}
    {!loading && restaurant ? <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
      <section className="min-w-0" aria-label="Venue tables">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <label className="block w-full max-w-xs text-sm font-semibold">Area
            <select className="field mt-1 min-h-11" value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
              <option value="">All areas</option>
              {areas.map((name) => <option key={name} value={`area:${name}`}>{name}</option>)}
              <option value="none">Unassigned</option>
            </select>
          </label>
          <a href="#table-details" className="btn btn-ink min-h-11" onClick={(event) => {
            if (busy) { event.preventDefault(); return; }
            selectTable(null);
            if (areaFilter.startsWith("area:")) setArea(areaFilter.slice(5));
          }}>Add table</a>
        </div>
        {visible.length === 0 ? <EmptyState title={tables.length ? "No tables in this area" : "No tables yet"}
          copy={tables.length ? "Choose another area or add a table." : "Add your first table to create its guest QR."} /> : <ul className="divide-y divide-[var(--rule)] card overflow-hidden">
          {visible.map((table) => <li key={table.id}>
            <a href="#table-details" aria-current={selectedId === table.id ? "true" : undefined}
              onClick={(event) => { if (busy) event.preventDefault(); else selectTable(table.id); }}
              className={`flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--paper)] ${selectedId === table.id ? "bg-[var(--paper)]" : ""}`}>
              <span className="min-w-0 break-words">
                <strong className="block">Table {table.tableNumber}{table.label ? ` · ${table.label}` : ""}</strong>
                <span className="text-sm text-[var(--ink-soft)]">{table.area || "Unassigned"}</span>
              </span>
              <span className={`shrink-0 text-sm ${table.isActive ? "text-[var(--sage)]" : "text-[var(--ink-soft)]"}`}>
                {table.isActive ? "Active" : "Inactive"}
              </span>
            </a>
          </li>)}
        </ul>}
      </section>
      <section id="table-details" tabIndex={-1} aria-labelledby="table-details-heading" className="card min-w-0 scroll-mt-4 p-4 sm:p-5">
        <h2 id="table-details-heading" className="display break-words text-2xl">
          {editing ? "Edit table" : selected ? `Table ${selected.tableNumber}${selected.label ? ` · ${selected.label}` : ""}` : "Add table"}
        </h2>
        {notice ? <p role="status" className="mt-2 text-sm text-[var(--sage)]">{notice}</p> : null}
        {actionError ? <p role="alert" className="mt-3 rounded-xl bg-[#f3d0c8] p-3 text-sm">{actionError}</p> : null}
        {!selected || editing ? <form className="mt-4 space-y-3" onSubmit={saveTable}>
          <fieldset disabled={busy} className="space-y-3">
            <label className="block text-sm font-semibold">Table number
              <input className="field mt-1 min-h-11" type="number" inputMode="numeric" required min={1} max={2147483647} step={1}
                value={numberValue} onChange={(event) => setNumber(event.target.value)} />
            </label>
            <label className="block text-sm font-semibold">Label <span className="font-normal text-[var(--ink-soft)]">(optional)</span>
              <input className="field mt-1 min-h-11" placeholder="e.g. Window" value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <label className="block text-sm font-semibold">Area <span className="font-normal text-[var(--ink-soft)]">(optional)</span>
              <input className="field mt-1 min-h-11" list="venue-areas" placeholder="e.g. Patio" value={area} maxLength={80} onChange={(event) => setArea(event.target.value)} />
            </label>
            <datalist id="venue-areas">{areas.map((name) => <option key={name} value={name} />)}</datalist>
            <div className="flex flex-wrap gap-2">
              {!editing && number !== null && number !== String(suggested) ? <button type="button" className="btn btn-ghost min-h-11" onClick={() => setNumber(null)}>Use available number {suggested}</button> : null}
              <button type="submit" className="btn btn-chili min-h-11">{busy ? "Saving…" : editing ? "Save changes" : "Create table"}</button>
              {editing ? <button type="button" className="btn btn-ghost min-h-11" onClick={() => selectTable(selectedId)}>Cancel</button> : null}
            </div>
          </fieldset>
        </form> : <>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">{selected.area || "Unassigned"} · {selected.isActive ? "Active" : "Inactive"}</p>
          {selected.isActive ? <TableQr key={selected.qrToken} table={selected} guestUrl={`${origin}/m/${encodeURIComponent(restaurant.slug)}/${encodeURIComponent(selected.qrToken)}`} />
            : <p className="mt-3 text-sm">Guests and staff can’t place new orders at this table while it’s inactive.</p>}
          {confirmation ? <div className="mt-4 rounded-xl bg-[#fff4d6] p-3">
            <p className="text-sm">{confirmation === "rotate" ? "Replacing this QR immediately breaks the old link and printed code. Print the new code before returning the table to service." : "This pauses new guest and staff orders for this table. Existing tickets stay on the board."}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} className="btn btn-chili min-h-11" onClick={() => changeTable(confirmation)}>
                {confirmation === "rotate" ? "Replace QR" : "Deactivate table"}
              </button>
              <button type="button" disabled={busy} className="btn btn-ghost min-h-11" onClick={() => setConfirmation(null)}>Cancel</button>
            </div>
          </div> : <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--rule)] pt-4">
            <button type="button" disabled={busy} className="btn btn-ghost min-h-11" onClick={() => {
              setNumber(String(selected.tableNumber));
              setLabel(selected.label ?? "");
              setArea(selected.area ?? "");
              setEditing(true);
              setActionError("");
              setNotice("");
            }}>Edit table</button>
            {selected.isActive ? <>
              <button type="button" disabled={busy} className="btn btn-ghost min-h-11" onClick={() => setConfirmation("rotate")}>Replace QR</button>
              <button type="button" disabled={busy} className="btn btn-ghost min-h-11" onClick={() => setConfirmation("deactivate")}>Deactivate</button>
            </> : <button type="button" disabled={busy} className="btn btn-ink min-h-11" onClick={() => changeTable("activate")}>Activate table</button>}
          </div>}
        </>}
      </section>
    </div> : null}
  </div>;
}
