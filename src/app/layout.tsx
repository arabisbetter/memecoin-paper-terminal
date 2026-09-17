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
import "./parts45.css";
import "./final-release.css";
import "./errors.css";
import "./landing.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://memecoin-paper-terminal.vercel.app"),
  title: "PAPER — Trade PAPER. Earn real.",
  description: "Start with $1,000 PAPER and trade real memecoin market conditions with simulated execution. No wallet. No deposits.",
  openGraph: {
    title: "PAPER — Trade PAPER. Earn real.",
    description: "$1,000 PAPER. Real memecoin markets. Simulated execution. No wallet.",
    siteName: "PAPER",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PAPER — Trade PAPER. Earn real.",
    description: "$1,000 PAPER. Real memecoin markets. Simulated execution. No wallet.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<RecoveryNudge/></body>
    </html>
  );
}
