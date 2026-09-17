import { NextResponse } from "next/server";
import { normalizePair } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profileRes = await fetch("https://api.dexscreener.com/token-profiles/latest/v1", { cache: "no-store" });
    if (!profileRes.ok) throw new Error(`profiles ${profileRes.status}`);
    const profiles = (await profileRes.json()) as Array<{ chainId?: string; tokenAddress?: string }>;
    const mints = profiles.filter((x) => x.chainId === "solana" && x.tokenAddress).slice(0, 30).map((x) => x.tokenAddress as string);
    if (!mints.length) return NextResponse.json({ tokens: [], source: "dexscreener" });
    const pairRes = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mints.join(",")}`, { cache: "no-store" });
    if (!pairRes.ok) throw new Error(`pairs ${pairRes.status}`);
    const pairs = (await pairRes.json()) as unknown[];
    const bestByMint = new Map<string, ReturnType<typeof normalizePair>>();
    for (const raw of pairs) {
      const token = normalizePair(raw as never);
      if (!token) continue;
      const prev = bestByMint.get(token.mint);
      if (!prev || token.liquidityUsd > prev.liquidityUsd) bestByMint.set(token.mint, token);
    }
    const tokens = [...bestByMint.values()].filter(Boolean).sort((a, b) => (b?.pairCreatedAt || 0) - (a?.pairCreatedAt || 0));
    return NextResponse.json({ tokens, source: "dexscreener", live: true });
  } catch (error) {
    console.error("market_latest_feed_error", error);
    return NextResponse.json({ tokens: [], error: error instanceof Error ? error.message : "market feed error" }, { status: 502 });
  }
}
