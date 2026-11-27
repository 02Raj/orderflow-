"use client";

import { AppShell } from "@/components/app-shell";
import { KitchenBoard } from "@/components/kitchen-board";
import { getUser } from "@/lib/session";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getServerRole = () => null;
const getRole = () => getUser()?.role ?? null;

export default function KitchenPage() {
  const role = useSyncExternalStore(subscribe, getRole, getServerRole);

  if (role === "kitchen") return <KitchenBoard />;
  return (
    <AppShell>
      <KitchenBoard />
    </AppShell>
  );
}
