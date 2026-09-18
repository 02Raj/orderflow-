"use client";

import { api, formatMoney } from "@/lib/api";
import { MenuCategory, MenuItem, Order } from "@/lib/types";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface VenuePayload {
  restaurant: {
    name: string;
    currency: string;
    locale: string;
    taxLabel: string;
    taxInclusive: boolean;
  };
  table: { id: string; number: number; label: string | null };
  orderingEnabled: boolean;
  menu: { categories: MenuCategory[]; items: MenuItem[] };
}

interface CartLine {
  key: string;
  menuItemId: string;
  name: string;
  unitPriceMinor: number;
  quantity: number;
  note: string;
  modifierIds: string[];
  modifierNames: string[];
}

export default function GuestMenuPage() {
  const params = useParams<{ slug: string; token: string }>();
  const [data, setData] = useState<VenuePayload | null>(null);
  const [error, setError] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [placed, setPlaced] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<VenuePayload>(`/public/venues/${params.slug}/tables/${params.token}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Menu unavailable"));
  }, [params.slug, params.token]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0),
    [cart],
  );

  function addItem(item: MenuItem, modifierIds: string[]) {
    const mods = item.modifiers.filter((m) => modifierIds.includes(m.id));
    const unit =
      item.priceMinor + mods.reduce((sum, m) => sum + m.priceAdjustmentMinor, 0);
    const key = `${item.id}:${modifierIds.slice().sort().join(",")}`;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          key,
          menuItemId: item.id,
          name: item.name,
          unitPriceMinor: unit,
          quantity: 1,
          note: "",
          modifierIds,
          modifierNames: mods.map((m) => m.name),
        },
      ];
    });
  }

  async function place() {
    if (!cart.length) return;
    setBusy(true);
    setError("");
    try {
      const order = await api<Order>(
        `/public/venues/${params.slug}/tables/${params.token}/orders`,
        {
          method: "POST",
          json: {
            clientRef: crypto.randomUUID(),
            customerName: name || undefined,
            note: note || undefined,
            lines: cart.map((line) => ({
              menuItemId: line.menuItemId,
              quantity: line.quantity,
              note: line.note || undefined,
              modifierIds: line.modifierIds,
            })),
          },
        },
      );
      setPlaced(order);
      setCart([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the ticket");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center">
        <h1 className="text-3xl" style={{ fontFamily: "var(--font-serif)" }}>
          This table is not live
        </h1>
        <p className="mt-3 text-sm text-[var(--ink-soft)]">{error}</p>
      </main>
    );
  }

  if (!data) {
    return <main className="grid min-h-screen place-items-center text-sm">Loading the menu…</main>;
  }

  if (placed) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--chili)]">Ticket sent</p>
        <h1 className="mt-3 text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
          #{placed.orderNumber}
        </h1>
        <p className="mt-3 text-[var(--ink-soft)]">
          Table {data.table.number}. The kitchen has your order. Pay at the table as you usually do.
        </p>
        <button className="mt-8 underline" onClick={() => setPlaced(null)}>
          Order something else
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg pb-40">
      <header className="border-b border-[var(--rule)] px-5 py-8">
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--chili)]">Table {data.table.number}</p>
        <h1 className="mt-2 text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
          {data.restaurant.name}
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          Scan, pick, send. No account. Kitchen gets the ticket as written.
        </p>
        {!data.orderingEnabled ? (
          <p className="mt-3 bg-[#f3d0c8] px-3 py-2 text-sm">This venue is not taking digital orders right now.</p>
        ) : null}
      </header>

      {data.menu.categories.map((cat) => {
        const catItems = data.menu.items.filter((i) => i.categoryId === cat.id);
        if (!catItems.length) return null;
        return (
          <section key={cat.id} className="px-5 py-6">
            <h2 className="border-b border-[var(--rule)] pb-2 text-2xl" style={{ fontFamily: "var(--font-serif)" }}>
              {cat.name}
            </h2>
            <ul>
              {catItems.map((item) => (
                <GuestItem
                  key={item.id}
                  item={item}
                  currency={data.restaurant.currency}
                  locale={data.restaurant.locale}
                  disabled={!data.orderingEnabled}
                  onAdd={addItem}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {cart.length ? (
        <footer className="fixed inset-x-0 bottom-0 border-t border-[var(--ink)] bg-[var(--ticket)] p-4">
          <div className="mx-auto max-w-lg">
            {cart.map((line) => (
              <div key={line.key} className="flex justify-between text-sm">
                <span>
                  {line.quantity}× {line.name}
                  {line.modifierNames.length ? ` (${line.modifierNames.join(", ")})` : ""}
                </span>
                <span>
                  {formatMoney(line.unitPriceMinor * line.quantity, data.restaurant.currency, data.restaurant.locale)}
                </span>
              </div>
            ))}
            <input
              className="mt-3 w-full border border-[var(--rule)] px-2 py-2 text-sm"
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="mt-2 w-full border border-[var(--rule)] px-2 py-2 text-sm"
              placeholder="Allergies or notes for the kitchen"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {error ? <p className="mt-2 text-sm text-[var(--chili)]">{error}</p> : null}
            <button
              disabled={busy || !data.orderingEnabled}
              onClick={place}
              className="mt-3 w-full bg-[var(--chili)] py-3 text-sm font-semibold text-[var(--ticket)]"
            >
              {busy
                ? "Sending…"
                : `Send ticket · ${formatMoney(total, data.restaurant.currency, data.restaurant.locale)}`}
            </button>
          </div>
        </footer>
      ) : null}
    </main>
  );
}

function GuestItem({
  item,
  currency,
  locale,
  disabled,
  onAdd,
}: {
  item: MenuItem;
  currency: string;
  locale: string;
  disabled: boolean;
  onAdd: (item: MenuItem, modifierIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mods, setMods] = useState<string[]>([]);

  return (
    <li className="border-b border-[var(--rule)] py-4">
      <button
        className="flex w-full items-start justify-between text-left"
        disabled={disabled}
        onClick={() => {
          if (item.modifiers.length) setOpen((v) => !v);
          else onAdd(item, []);
        }}
      >
        <span>
          <span className="block font-medium">{item.name}</span>
          {item.description ? (
            <span className="mt-1 block text-sm text-[var(--ink-soft)]">{item.description}</span>
          ) : null}
        </span>
        <span className="text-sm">{formatMoney(item.priceMinor, currency, locale)}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-2">
          {item.modifiers.map((mod) => (
            <label key={mod.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={mods.includes(mod.id)}
                onChange={(e) =>
                  setMods((prev) =>
                    e.target.checked ? [...prev, mod.id] : prev.filter((id) => id !== mod.id),
                  )
                }
              />
              {mod.name}
              {mod.priceAdjustmentMinor
                ? ` (${formatMoney(mod.priceAdjustmentMinor, currency, locale)})`
                : ""}
            </label>
          ))}
          <button
            className="bg-[var(--ink)] px-3 py-2 text-xs text-[var(--ticket)]"
            onClick={() => {
              onAdd(item, mods);
              setOpen(false);
              setMods([]);
            }}
          >
            Add to ticket
          </button>
        </div>
      ) : null}
    </li>
  );
}
