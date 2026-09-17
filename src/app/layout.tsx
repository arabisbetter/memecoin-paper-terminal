import type { Metadata } from "next";
import "./globals.css";
import "./product-polish.css";
import "./spot-polish.css";
import "./leader-polish.css";
import "./bugfix.css";
import "./axiom-clone.css";
import "./terminal-finishing.css";
import "./smoothness.css";
import "./v3.css";
import "./live-upgrade.css";

export const metadata: Metadata = {
  title: "PAPER — Memecoin Paper Trading Terminal",
  description: "Live Solana memecoins. PAPER money. Real market movement.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
