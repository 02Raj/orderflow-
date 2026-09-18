"use client";

import { AppShell } from "@/components/app-shell";
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
  }

  useEffect(() => {
    reload().catch(() => undefined);
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
          <h1 className="text-4xl" style={{ fontFamily: "var(--font-serif)" }}>
            Staff
          </h1>
          <ul className="mt-6 divide-y divide-[var(--rule)]">
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
        </div>
        <form onSubmit={create} className="border border-[var(--rule)] bg-[var(--ticket)] p-5">
          <h2 className="font-semibold">Invite a station login</h2>
          <input
            className="mt-3 w-full border border-[var(--rule)] px-2 py-2 text-sm"
            placeholder="Name"
            required
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
          <input
            className="mt-2 w-full border border-[var(--rule)] px-2 py-2 text-sm"
            placeholder="Email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className="mt-2 w-full border border-[var(--rule)] px-2 py-2 text-sm"
            placeholder="Password"
            minLength={8}
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <select
            className="mt-2 w-full border border-[var(--rule)] px-2 py-2 text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="manager">Manager</option>
            <option value="staff">Floor staff</option>
            <option value="kitchen">Kitchen</option>
          </select>
          <button className="mt-4 w-full bg-[var(--ink)] py-2 text-sm text-[var(--ticket)]">
            Create login
          </button>
        </form>
      </div>
    </AppShell>
  );
}
