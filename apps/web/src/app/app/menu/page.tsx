"use client";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
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
    imageUrl: "",
  });
  const [catName, setCatName] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function reload(current = token) {
    if (!current) return;
    const menu = await api<{ categories: MenuCategory[]; items: MenuItem[] }>("/menu", {
      token: current,
    });
    setCategories(menu.categories);
    setItems(menu.items);
    setLoaded(true);
  }

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (!t) return;
    api<Restaurant>("/restaurant", { token: t }).then(setRestaurant);
    reload(t).catch(() => setLoaded(true));
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
        imageUrl: itemForm.imageUrl || undefined,
      },
    });
    setItemForm({
      name: "",
      price: "",
      categoryId: itemForm.categoryId,
      description: "",
      imageUrl: "",
    });
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
          <PageHeader
            kicker="Catalogue"
            title="Menu"
            copy="Paste the menu you already have. Format: a category ending with a colon, then one item and price per line. Optional photo URLs show on the guest menu."
          />
          {error ? <p className="mt-3 text-sm text-[var(--chili)]">{error}</p> : null}

          {!loaded ? (
            <div className="mt-8 skeleton h-64 w-full" />
          ) : categories.length === 0 ? (
            <form onSubmit={importMenu} className="card mt-6 p-4">
              <textarea
                className="field h-48"
                placeholder={"Mains:\nFish pie 16.50\nRye chicken 17.50\nDrinks:\nLemonade 3.50"}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <button className="btn btn-chili mt-3">Import menu</button>
            </form>
          ) : (
            <div className="mt-6 space-y-8">
              {categories.map((cat) => (
                <section key={cat.id} className="card p-5">
                  <h2 className="display border-b border-[var(--rule)] pb-2 text-xl">{cat.name}</h2>
                  <ul>
                    {items
                      .filter((item) => item.categoryId === cat.id)
                      .map((item) => (
                        <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                          <div className="flex gap-3">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="h-12 w-12 rounded-lg object-cover"
                              />
                            ) : null}
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
          <form onSubmit={addCategory} className="card p-4">
            <h3 className="font-semibold">Add category</h3>
            <input
              className="field mt-2"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              required
            />
            <button className="btn btn-ink mt-2 w-full">Add</button>
          </form>
          <form onSubmit={addItem} className="card p-4">
            <h3 className="font-semibold">Add item</h3>
            <select
              className="field mt-2"
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
              className="field mt-2"
              placeholder="Name"
              required
              value={itemForm.name}
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            />
            <input
              className="field mt-2"
              placeholder="Price"
              required
              value={itemForm.price}
              onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
            />
            <input
              className="field mt-2"
              placeholder="Description"
              value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
            />
            <input
              className="field mt-2"
              placeholder="Image URL (optional)"
              value={itemForm.imageUrl}
              onChange={(e) => setItemForm({ ...itemForm, imageUrl: e.target.value })}
            />
            <button className="btn btn-ink mt-2 w-full">Add item</button>
          </form>
          <form onSubmit={importMenu} className="card p-4">
            <h3 className="font-semibold">Paste more items</h3>
            <textarea
              className="field mt-2 h-28"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <button className="btn btn-ghost mt-2 w-full">Import</button>
          </form>
        </aside>
      </div>
    </AppShell>
  );
}
