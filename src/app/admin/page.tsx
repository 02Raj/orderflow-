import type { Metadata } from "next";
import { AdminPortal } from "./portal";

export const metadata: Metadata = {
  title: "Platform admin | OrderNFlow",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminPortal />;
}
