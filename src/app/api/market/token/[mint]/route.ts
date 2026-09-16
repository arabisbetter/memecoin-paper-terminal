import { NextRequest, NextResponse } from "next/server";
import { normalizePair } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ mint: string }> }) {
  const { mint } = await ctx.params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return NextResponse.json({ error: "Invalid mint" }, { status: 400 });
  try {
    const res = await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`DexScreener ${res.status}`);
    const pairs = (await res.json()) as unknown[];
    const tokens = pairs.map((p) => normalizePair(p as never)).filter(Boolean).sort((a, b) => (b?.liquidityUsd || 0) - (a?.liquidityUsd || 0));
    if (!tokens[0]) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    return NextResponse.json({ token: tokens[0], live: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "lookup failed" }, { status: 502 });
  }
}
