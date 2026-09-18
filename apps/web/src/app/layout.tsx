import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { RegisterSw } from "@/components/register-sw";

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "OrderFlow — QR to kitchen in five minutes",
  description:
    "Guests scan a table QR. The kitchen sees the ticket instantly. No hardware lock-in, no app download.",
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
