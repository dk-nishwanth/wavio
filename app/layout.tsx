import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "WAConnect — WhatsApp automation", description: "WhatsApp inbox, broadcasts and automation for your website" };

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
