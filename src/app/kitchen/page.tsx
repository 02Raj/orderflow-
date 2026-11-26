"use client";

import { AppShell } from "@/components/app-shell";
import { KitchenBoard } from "@/components/kitchen-board";
import { getUser } from "@/lib/session";
import { useEffect, useState } from "react";

export default function KitchenPage() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setRole(getUser()?.role ?? null);
  }, []);

  if (role === "kitchen") return <KitchenBoard />;
  return (
    <AppShell>
      <KitchenBoard />
    </AppShell>
  );
}
