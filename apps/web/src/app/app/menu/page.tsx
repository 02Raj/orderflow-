"use client";

import { AppShell } from "@/components/app-shell";
import { api, formatMoney } from "@/lib/api";
import { getToken } from "@/lib/session";
import { MenuCategory, MenuItem, Restaurant } from "@/lib/types";
import { FormEvent, useEffect, useState } from "react";

export default function MenuPage() {
  const [token, setToken] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [paste, setPaste] = useState("");
  const [itemForm, setItemForm] = useState({
    name: "",
    price: "",
    categoryId: "",
    description: "",
  });
  const [catName, setCatName] = useState("");
  const [error, setError] = useState("");

  async function reload(current = token) {
    if (!current) return;
    const menu = await api<{ categories: MenuCategory[]; items: MenuItem[] }>("/menu", {
      token: current,
    });
    setCategories(menu.categories);
    setItems(menu.items);
  }

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (!t) return;
    api<Restaurant>("/restaurant", { token: t }).then(setRestaurant);
    reload(t).catch(() => undefined);
  }, []);

  async function importMenu(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    try {
      await api("/menu/import", { method: "POST", token, json: { text: paste, replace: false } });
      setPaste("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    await api("/menu/categories", { method: "POST", token, json: { name: catName } });
    setCatName("");
    await reload();
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const priceMinor = Math.round(Number(itemForm.price) * 100);
    await api("/menu/items", {
      method: "POST",
      token,
      json: {
        name: itemForm.name,
        priceMinor,
        categoryId: itemForm.categoryId || undefined,
        description: itemForm.description,
      },
    });
    setItemForm({ name: "", price: "", categoryId: itemForm.categoryId, description: "" });
    await reload();
  }

  async function toggle(item: MenuItem) {
    if (!token) return;
    await api(`/menu/items/${item.id}`, {
      method: "PATCH",
      token,
      json: { isAvailable: !item.isAvailable, unavailableReason: item.isAvailable ? "86" : null },
    });
    await reload();
  }

  const currency = restaurant?.currency ?? "USD";

  return (
    <AppShell>
      <div className="grid gap-8 p-5 md:grid-cols-[1fr_320px] md:p-8">
        <div>
          <h1 className="text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
            Menu
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--ink-soft)]">
            Paste the menu you already have. Format: a category ending with a colon, then one item
            and price per line.
          </p>
          {error ? <p className="mt-3 text-sm text-[var(--chili)]">{error}</p> : null}

          {categories.length === 0 ? (
            <form onSubmit={importMenu} className="mt-6">
              <textarea
                className="h-48 w-full border border-[var(--rule)] bg-white p-3 text-sm"
                placeholder={"Mains:\nFish pie 16.50\nRye chicken 17.50\nDrinks:\nLemonade 3.50"}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <button className="mt-3 bg-[var(--chili)] px-4 py-2 text-sm text-[var(--ticket)]">
                Import menu
              </button>
            </form>
          ) : (
            <div className="mt-6 space-y-8">
              {categories.map((cat) => (
                <section key={cat.id}>
                  <h2 className="border-b border-[var(--rule)] pb-2 text-xl" style={{ fontFamily: "var(--font-serif)" }}>
                    {cat.name}
                  </h2>
                  <ul>
                    {items
                      .filter((item) => item.categoryId === cat.id)
                      .map((item) => (
                        <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                          <div>
                            <p className={!item.isAvailable ? "line-through opacity-60" : ""}>
                              {item.name}
                            </p>
                            {item.description ? (
                              <p className="text-xs text-[var(--ink-soft)]">{item.description}</p>
                            ) : null}
                            {item.modifiers?.length ? (
                              <p className="text-xs text-[var(--ink-soft)]">
                                {item.modifiers.map((m) => m.name).join(" · ")}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span>{formatMoney(item.priceMinor, currency, restaurant?.locale)}</span>
                            <button className="underline" onClick={() => toggle(item)}>
                              {item.isAvailable ? "86" : "Back on"}
                            </button>
                          </div>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <form onSubmit={addCategory} className="border border-[var(--rule)] bg-[var(--ticket)] p-4">
            <h3 className="font-semibold">Add category</h3>
            <input
              className="mt-2 w-full border border-[var(--rule)] px-2 py-2 text-sm"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              required
            />
            <button className="mt-2 w-full bg-[var(--ink)] py-2 text-sm text-[var(--ticket)]">
              Add
            </button>
          </form>
          <form onSubmit={addItem} className="border border-[var(--rule)] bg-[var(--ticket)] p-4">
            <h3 className="font-semibold">Add item</h3>
            <select
              className="mt-2 w-full border border-[var(--rule)] px-2 py-2 text-sm"
              value={itemForm.categoryId}
              onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
            >
              <option value="">Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className="mt-2 w-full border border-[var(--rule)] px-2 py-2 text-sm"
              placeholder="Name"
              required
              value={itemForm.name}
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            />
            <input
              className="mt-2 w-full border border-[var(--rule)] px-2 py-2 text-sm"
              placeholder="Price"
              required
              value={itemForm.price}
              onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
            />
            <input
              className="mt-2 w-full border border-[var(--rule)] px-2 py-2 text-sm"
              placeholder="Description"
              value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
            />
            <button className="mt-2 w-full bg-[var(--ink)] py-2 text-sm text-[var(--ticket)]">
              Add item
            </button>
          </form>
          <form onSubmit={importMenu} className="border border-[var(--rule)] bg-[var(--ticket)] p-4">
            <h3 className="font-semibold">Paste more items</h3>
            <textarea
              className="mt-2 h-28 w-full border border-[var(--rule)] p-2 text-sm"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <button className="mt-2 w-full border border-[var(--ink)] py-2 text-sm">Import</button>
          </form>
        </aside>
      </div>
    </AppShell>
  );
}
