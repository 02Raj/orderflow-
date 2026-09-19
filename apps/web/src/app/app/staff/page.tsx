"use client";

import { AppShell } from "@/components/app-shell";
import { EmptyState, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { getToken } from "@/lib/session";
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
    reload().catch(() => setLoaded(true));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    await api("/auth/staff", { method: "POST", token, json: form });
    setForm({ fullName: "", email: "", password: "", role: "staff" });
    await reload();
  }

  return (
    <AppShell>
      <div className="grid gap-8 p-5 md:grid-cols-2 md:p-8">
        <div>
          <PageHeader
            kicker="Team"
            title="Staff"
            copy="Station logins for floor, kitchen, and managers. Same product in every market."
          />
          {!loaded ? (
            <div className="skeleton mt-6 h-40 w-full" />
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
                  <span className="capitalize">{row.role}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form onSubmit={create} className="card p-5">
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
          <button className="btn btn-ink mt-4 w-full">Create login</button>
        </form>
      </div>
    </AppShell>
  );
}
