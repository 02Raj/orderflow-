import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { RegisterSw } from "@/components/register-sw";

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_PUBLIC_URL ?? "https://helloorderflow.com"),
  title: "OrderFlow — QR ordering for restaurants worldwide",
  description:
    "Guests scan a table QR. The kitchen sees the ticket in real time. Browser POS for independent restaurants in any market — no hardware lock-in.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "OrderFlow", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#1c1612",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} h-full`}>
      <body className="min-h-full antialiased">
        <RegisterSw />
        {children}
      </body>
    </html>
  );
}
