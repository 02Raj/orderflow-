"use client";

import { api, formatMoney } from "@/lib/api";
import { computeTotals, taxGuestHint } from "@/lib/tax";
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
    taxRateBp: number;
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
  const [pop, setPop] = useState(false);

  useEffect(() => {
    api<VenuePayload>(`/public/venues/${params.slug}/tables/${params.token}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Menu unavailable"));
  }, [params.slug, params.token]);

  const lineGross = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0),
    [cart],
  );
  const totals = useMemo(() => {
    if (!data) return null;
    return computeTotals(lineGross, {
      taxRateBp: data.restaurant.taxRateBp,
      taxInclusive: data.restaurant.taxInclusive,
    });
  }, [data, lineGross]);

  function addItem(item: MenuItem, modifierIds: string[]) {
    const mods = item.modifiers.filter((m) => modifierIds.includes(m.id));
    const unit = item.priceMinor + mods.reduce((sum, m) => sum + m.priceAdjustmentMinor, 0);
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
    setPop(true);
    window.setTimeout(() => setPop(false), 280);
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
        <h1 className="display text-3xl">This table is not live</h1>
        <p className="mt-3 text-sm text-[var(--ink-soft)]">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="w-64">
          <div className="skeleton h-8 w-40" />
          <div className="skeleton mt-4 h-24 w-full" />
        </div>
      </main>
    );
  }

  if (placed) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--chili)]">Ticket sent</p>
        <h1 className="display mt-3 text-4xl">#{placed.orderNumber}</h1>
        <ol className="mx-auto mt-8 flex max-w-xs justify-between text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          {["Sent", "Kitchen", "Ready"].map((step, i) => (
            <li key={step} className={i === 0 ? "text-[var(--chili)]" : ""}>
              <span className="mx-auto mb-1 block h-2 w-2 rounded-full bg-current" />
              {step}
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[var(--ink-soft)]">
          Table {data.table.number}. The kitchen has your order. Pay at the table as you usually do.
        </p>
        <button className="btn btn-ghost mt-8" onClick={() => setPlaced(null)}>
          Order something else
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg pb-48">
      <header className="border-b border-[var(--rule)] px-5 py-8">
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--chili)]">
          Table {data.table.number}
        </p>
        <h1 className="display mt-2 text-4xl">{data.restaurant.name}</h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          Scan, pick, send. No account. Kitchen gets the ticket as written.
        </p>
        <p className="mt-2 text-xs text-[var(--ink-soft)]">
          {taxGuestHint(
            data.restaurant.taxInclusive,
            data.restaurant.taxLabel,
            data.restaurant.taxRateBp,
          )}{" "}
          Your ticket goes only to this restaurant. We do not take card details.{" "}
          <a href="/privacy" className="underline">
            Privacy
          </a>
        </p>
        {!data.orderingEnabled ? (
          <p className="mt-3 rounded-xl bg-[#f3d0c8] px-3 py-2 text-sm">
            This venue is not taking digital orders right now.
          </p>
        ) : null}
      </header>

      {data.menu.categories.map((cat) => {
        const catItems = data.menu.items.filter((i) => i.categoryId === cat.id);
        if (!catItems.length) return null;
        return (
          <section key={cat.id} className="px-5 py-6">
            <h2 className="display border-b border-[var(--rule)] pb-2 text-2xl">{cat.name}</h2>
            <ul>
              {catItems.map((item) => (
                <GuestItem
                  key={item.id}
                  item={item}
                  currency={data.restaurant.currency}
                  locale={data.restaurant.locale}
                  taxInclusive={data.restaurant.taxInclusive}
                  disabled={!data.orderingEnabled}
                  onAdd={addItem}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {cart.length ? (
        <footer
          className={`fixed inset-x-0 bottom-0 border-t border-[var(--ink)] bg-[var(--ticket)] p-4 ${
            pop ? "cart-pop" : ""
          }`}
        >
          <div className="mx-auto max-w-lg">
            {cart.map((line) => (
              <div key={line.key} className="flex justify-between text-sm">
                <span>
                  {line.quantity}× {line.name}
                  {line.modifierNames.length ? ` (${line.modifierNames.join(", ")})` : ""}
                </span>
                <span>
                  {formatMoney(
                    line.unitPriceMinor * line.quantity,
                    data.restaurant.currency,
                    data.restaurant.locale,
                  )}
                </span>
              </div>
            ))}
            {totals && data.restaurant.taxRateBp > 0 ? (
              <div className="mt-3 space-y-1 border-t border-[var(--rule)] pt-2 text-sm">
                <div className="flex justify-between text-[var(--ink-soft)]">
                  <span>{data.restaurant.taxInclusive ? "Net" : "Subtotal"}</span>
                  <span>
                    {formatMoney(
                      totals.subtotalMinor,
                      data.restaurant.currency,
                      data.restaurant.locale,
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-[var(--ink-soft)]">
                  <span>{data.restaurant.taxLabel}</span>
                  <span>
                    {formatMoney(totals.taxMinor, data.restaurant.currency, data.restaurant.locale)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>{data.restaurant.taxInclusive ? "Total" : "Due at table"}</span>
                  <span>
                    {formatMoney(
                      totals.totalMinor,
                      data.restaurant.currency,
                      data.restaurant.locale,
                    )}
                  </span>
                </div>
              </div>
            ) : null}
            <input
              className="field mt-3"
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="field mt-2"
              placeholder="Allergies or notes for the kitchen"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {error ? <p className="mt-2 text-sm text-[var(--chili)]">{error}</p> : null}
            <button
              disabled={busy || !data.orderingEnabled}
              onClick={place}
              className="btn btn-chili mt-3 w-full py-3"
            >
              {busy
                ? "Sending…"
                : `Send ticket · ${formatMoney(
                    totals?.totalMinor ?? lineGross,
                    data.restaurant.currency,
                    data.restaurant.locale,
                  )}`}
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
  taxInclusive,
  disabled,
  onAdd,
}: {
  item: MenuItem;
  currency: string;
  locale: string;
  taxInclusive: boolean;
  disabled: boolean;
  onAdd: (item: MenuItem, modifierIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mods, setMods] = useState<string[]>([]);

  return (
    <li className="border-b border-[var(--rule)] py-4">
      <button
        className="flex w-full items-start justify-between gap-3 text-left"
        disabled={disabled}
        onClick={() => {
          if (item.modifiers.length) setOpen((v) => !v);
          else onAdd(item, []);
        }}
      >
        <span className="flex gap-3">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
          ) : null}
          <span>
            <span className="block font-medium">{item.name}</span>
            {item.description ? (
              <span className="mt-1 block text-sm text-[var(--ink-soft)]">{item.description}</span>
            ) : null}
          </span>
        </span>
        <span className="text-right text-sm">
          {formatMoney(item.priceMinor, currency, locale)}
          {!taxInclusive ? (
            <span className="block text-[10px] font-normal uppercase tracking-wider text-[var(--ink-soft)]">
              + tax
            </span>
          ) : null}
        </span>
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
            className="btn btn-ink px-3 py-2 text-xs"
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
