import "./globals.css";
import type { ReactNode } from "react";
import RegisterSW from "@/components/RegisterSW";

export const metadata = { title: "Wavio — WhatsApp automation", description: "WhatsApp inbox, broadcasts and automation for your website", manifest: "/manifest.webmanifest", appleWebApp: { capable: true, title: "Wavio" } };
export const viewport = { themeColor: "#063b26" };

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}<RegisterSW /></body>
    </html>
  );
}
