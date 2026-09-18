"use client";

import { useEffect } from "react";

export function RegisterSw() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker?.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
      return;
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
