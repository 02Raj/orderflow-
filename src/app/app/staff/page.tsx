"use client";

import { EmptyState, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { getToken, getUser } from "@/lib/session";
import { FormEvent, useEffect, useState } from "react";

interface StaffRow {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [owner, setOwner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "staff",
  });

  async function reload() {
    const token = getToken();
    if (!token) return;
    setStaff(await api<StaffRow[]>("/auth/staff", { token }));
    setLoaded(true);
  }

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    api<StaffRow[]>("/auth/staff", { token }).then((rows) => {
      setStaff(rows);
      setOwner(getUser()?.role === "owner");
    }).catch(() => setError("Could not load staff.")).finally(() => setLoaded(true));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      await api("/auth/staff", { method: "POST", token, json: form });
      setForm({ fullName: "", email: "", password: "", role: "staff" });
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not create staff login.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: StaffRow) {
    const token = getToken();
    if (!token) return;
    if (row.isActive && !window.confirm(`Disable access for ${row.fullName}?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/auth/staff/${row.id}/status`, { method: "PATCH", token, json: { active: !row.isActive } });
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update staff access.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 p-5 md:grid-cols-2 md:p-8">
        <div>
          <PageHeader
            kicker="Team"
            title="Staff"
            copy="Station logins for floor, kitchen, and managers. Same product in every market."
          />
          {error && <p role="alert" className="mt-4 text-sm text-[var(--chili-dark)]">{error}</p>}
          {!loaded ? (
            <div className="mt-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-2xl" />
              ))}
            </div>
          ) : staff.length === 0 ? (
            <EmptyState title="No logins yet" copy="Create a kitchen login so the pass never shares the owner password." />
          ) : (
            <ul className="card mt-6 divide-y divide-[var(--rule)] px-4">
              {staff.map((row) => (
                <li key={row.id} className="flex justify-between py-3 text-sm">
                  <span>
                    {row.fullName}
                    <span className="block text-[var(--ink-soft)]">{row.email}</span>
                  </span>
                  <span className="text-right">
                    <span className="block capitalize">{row.role} · {row.isActive ? "Active" : "Disabled"}</span>
                    {owner && row.role !== "owner" && <button disabled={busy} className="mt-1 min-h-9 underline" onClick={() => toggle(row)}>{row.isActive ? "Disable access" : "Enable access"}</button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {owner && <form method="post" onSubmit={create} className="card p-5">
          <h2 className="font-semibold">Invite a station login</h2>
          <input
            className="field mt-3"
            placeholder="Name"
            required
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
          <input
            className="field mt-2"
            placeholder="Email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className="field mt-2"
            placeholder="Password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <select
            className="field mt-2"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="manager">Manager</option>
            <option value="staff">Floor staff</option>
            <option value="kitchen">Kitchen</option>
          </select>
          <button disabled={busy} className="btn btn-ink mt-4 w-full">Create login</button>
        </form>}
      </div>
  );
}
