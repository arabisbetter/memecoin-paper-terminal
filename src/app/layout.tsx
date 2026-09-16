import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PAPER.FUN — Memecoin Paper Trading Terminal",
  description: "Real memecoins. Real pumps. Real rugs. Paper money.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
