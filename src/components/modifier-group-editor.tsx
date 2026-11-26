"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { MenuItem, ModifierGroup } from "@/lib/types";

type OptionDraft = { key: string; id?: string; name: string; price: string };
const blank = (): OptionDraft => ({ key: crypto.randomUUID(), name: "", price: "" });

export function ModifierGroupEditor({ items, token, currency, reload }: {
  items: MenuItem[];
  token: string;
  currency: string;
  reload: () => Promise<void>;
}) {
  const [itemId, setItemId] = useState("");
  const [group, setGroup] = useState<ModifierGroup | null>(null);
  const [name, setName] = useState("");
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(1);
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const item = items.find((row) => row.id === itemId);

  function start(next: ModifierGroup | null, selected = item) {
    setGroup(next);
    setName(next?.name ?? "");
    setMin(next?.minChoices ?? 1);
    setMax(next?.maxChoices ?? 1);
    setOptions(next ? (selected?.modifiers ?? []).filter((mod) => mod.groupId === next.id).map((mod) => ({
      key: mod.id, id: mod.id, name: mod.name, price: mod.priceAdjustmentMinor ? String(mod.priceAdjustmentMinor / 100) : "",
    })) : [blank(), blank()]);
    setMessage("");
  }

  async function persist(event?: FormEvent<HTMLFormElement>, remove = false) {
    event?.preventDefault();
    if (!item || busy || (remove && (!group || !window.confirm(`Remove “${group.name}” from ${item.name}?`)))) return;
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      await api(`/menu/items/${item.id}/modifier-groups${group ? `/${group.id}` : ""}`, {
        method: remove ? "DELETE" : group ? "PATCH" : "POST",
        token,
        json: remove ? undefined : {
          name, minChoices: min, maxChoices: max,
          options: options.map(({ id, name: label, price }) => ({ id, name: label, priceAdjustmentMinor: Math.round(Number(price) * 100) })),
        },
      });
      await reload();
      start(null);
      setMessage(remove ? "Option group removed." : "Option group saved.");
    } catch (failure) {
      setError(true);
      setMessage(failure instanceof Error ? failure.message : "Could not save the option group.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="card p-4" aria-labelledby="modifier-groups-heading">
    <h3 id="modifier-groups-heading" className="font-semibold">Modifier groups</h3>
    <p className="mt-1 text-xs text-[var(--ink-soft)]">Add choices like size, milk or toppings to a menu item.</p>
    <label className="mt-3 block text-sm">Menu item
      <select className="field mt-1" value={itemId} disabled={busy} onChange={(event) => {
        const next = event.target.value;
        setItemId(next);
        start(null, items.find((row) => row.id === next));
      }}>
        <option value="">Choose an item</option>
        {items.map((row) => <option value={row.id} key={row.id}>{row.name}</option>)}
      </select>
    </label>
    {item && <>
      <div className="mt-3 flex flex-wrap gap-2">
        {(item.modifierGroups ?? []).map((existing) => (
          <button key={existing.id} type="button" disabled={busy} aria-pressed={group?.id === existing.id}
            className={`btn ${group?.id === existing.id ? "btn-ink" : "btn-ghost"}`} onClick={() => start(existing)}>{existing.name}</button>
        ))}
        {group && <button type="button" disabled={busy} className="btn btn-ghost" onClick={() => start(null)}>New group</button>}
      </div>
      <form method="post" onSubmit={persist} className="mt-3 space-y-3">
        <fieldset disabled={busy} className="space-y-3">
          <legend className="text-sm font-semibold">{group ? `Edit ${group.name}` : "New group"}</legend>
          <label className="block text-sm">Group name
            <input required maxLength={60} className="field mt-1" placeholder="e.g. Size" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">Minimum
              <input required type="number" min={0} max={max} className="field mt-1" value={min} onChange={(event) => setMin(Number(event.target.value))} />
            </label>
            <label className="text-sm">Maximum
              <input required type="number" min={Math.max(1, min)} max={options.length} className="field mt-1" value={max} onChange={(event) => setMax(Number(event.target.value))} />
            </label>
          </div>
          <p className="text-xs text-[var(--ink-soft)]">1 and 1 means choose exactly one. Minimum 0 makes the group optional.</p>
          {options.map((option, index) => <div key={option.key} className="rounded-lg border border-[var(--rule)] p-2">
            <div className="grid grid-cols-[1.3fr_1fr] gap-2">
              <label className="text-xs">Option {index + 1}
                <input required maxLength={60} className="field mt-1" value={option.name} onChange={(event) => setOptions((rows) => rows.map((row) => row.key === option.key ? { ...row, name: event.target.value } : row))} />
              </label>
              <label className="text-xs">Extra ({currency})
                <input type="number" min={0} max={10000} step="0.01" placeholder="0.00" className="field mt-1" value={option.price} onChange={(event) => setOptions((rows) => rows.map((row) => row.key === option.key ? { ...row, price: event.target.value } : row))} />
              </label>
            </div>
            {options.length > 1 && <button type="button" className="mt-2 text-xs underline" onClick={() => setOptions((rows) => rows.filter((row) => row.key !== option.key))}>Remove option {index + 1}</button>}
          </div>)}
          <button type="button" disabled={options.length >= 20} className="btn btn-ghost" onClick={() => setOptions((rows) => [...rows, blank()])}>Add option</button>
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={busy} className="btn btn-ink">{busy ? "Saving…" : "Save group"}</button>
          {group && <button disabled={busy} type="button" className="btn btn-ghost" onClick={() => persist(undefined, true)}>Remove group</button>}
        </div>
      </form>
    </>}
    {message && <p role={error ? "alert" : "status"} className="mt-3 text-sm">{message}</p>}
  </section>;
}
