import type { Metadata } from "next";
import RecoveryNudge from "@/components/RecoveryNudge";
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
import "./phase1.css";
import "./p0-extra.css";
import "./parts23.css";
import "./parts23-tape.css";
import "./errors.css";

export const metadata: Metadata = {
  title: "PAPER — Memecoin Paper Trading Terminal",
  description: "Real memecoin market data. Simulated PAPER trading. No wallet required.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<RecoveryNudge/></body>
    </html>
  );
}
