import type { Metadata, Viewport } from "next";
import RecoveryNudge from "@/components/RecoveryNudge";
import NetworkStatus from "@/components/NetworkStatus";
import TerminalPreferences from "@/components/TerminalPreferences";
import PwaRegistrar from "@/components/PwaRegistrar";
import GlobalLegalFooter from "@/components/GlobalLegalFooter";
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
import "./chart-discover-polish.css";
import "./performance-charity-polish.css";
import "./evaluation.css";
import "./phase23-control.css";
import "./funded.css";
import "./terminal-v2.css";
import "./axiom-chart.css";
import "./part7.css";
import "./part8.css";
import "./part9.css";
import "./part10.css";
import "./master-redesign.css";
import "./landing.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://memecoin-paper-terminal.vercel.app"),
  applicationName: "PAPER",
  title: "PAPER — Solana memecoin paper trading",
  description: "Practice Solana memecoin trading with 1,000 PAPER SOL, real market inputs, and simulated execution. No wallet, deposits, or real-money trades.",
  keywords: ["memecoin paper trading", "Solana paper trading", "crypto trading simulator", "memecoin simulator", "paper trading", "Solana memecoins"],
  category: "finance",
  alternates: { canonical: "/" },
  openGraph: {
    title: "PAPER — Solana memecoin paper trading",
    description: "1,000 PAPER SOL. Real Solana memecoin market inputs. Simulated execution only.",
    siteName: "PAPER",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "PAPER — Solana memecoin paper trading",
    description: "1,000 PAPER SOL. Real Solana memecoin market inputs. Simulated execution only.",
  },
};

export const viewport: Viewport = {
  themeColor: "#05070a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<GlobalLegalFooter/><PwaRegistrar/><TerminalPreferences/><NetworkStatus/><RecoveryNudge/></body>
    </html>
  );
}
