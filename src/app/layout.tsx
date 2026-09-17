import type { Metadata } from "next";
import "./globals.css";
import "./product-polish.css";

export const metadata: Metadata = {
  title: "PAPER — Memecoin Paper Trading Terminal",
  description: "Live memecoins. PAPER money. Real market movement.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
