import { NextResponse } from "next/server";
import { normalizePair } from "@/lib/market";
import type { MarketToken } from "@/lib/types";

export const dynamic = "force-dynamic";

let lastGood: { at: number; tokens: MarketToken[]; source: string } | null = null;
const CACHE_MS = 8_000;

async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 7_000): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "paper-memecoin-terminal/1.0",
        ...(init.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(id);
  }
}

async function dexScreenerFeed(): Promise<MarketToken[]> {
  const profiles = await fetchJson<Array<{ chainId?: string; tokenAddress?: string }>>(
    "https://api.dexscreener.com/token-profiles/latest/v1",
  );
  const mints = [...new Set(
    profiles
      .filter((x) => x.chainId === "solana" && x.tokenAddress)
      .map((x) => x.tokenAddress as string),
  )].slice(0, 30);

  if (!mints.length) throw new Error("DexScreener returned no Solana token profiles");

  const pairs = await fetchJson<unknown[]>(
    `https://api.dexscreener.com/tokens/v1/solana/${mints.join(",")}`,
  );

  const bestByMint = new Map<string, MarketToken>();
  for (const raw of pairs) {
    const token = normalizePair(raw as never);
    if (!token || token.priceUsd <= 0) continue;
    const prev = bestByMint.get(token.mint);
    if (!prev || token.liquidityUsd > prev.liquidityUsd) bestByMint.set(token.mint, token);
  }

  const tokens = [...bestByMint.values()].sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0));
  if (!tokens.length) throw new Error("DexScreener returned no usable Solana pairs");
  return tokens;
}

type GeckoIncluded = {
  id?: string;
  type?: string;
  attributes?: { address?: string; name?: string; symbol?: string; image_url?: string };
};

type GeckoPool = {
  id?: string;
  attributes?: {
    address?: string;
    name?: string;
    base_token_price_usd?: string;
    base_token_price_native_currency?: string;
    market_cap_usd?: string | null;
    fdv_usd?: string | null;
    reserve_in_usd?: string | null;
    pool_created_at?: string;
    price_change_percentage?: { h24?: string };
    volume_usd?: { h24?: string };
    transactions?: { h24?: { buys?: number; sells?: number } };
  };
  relationships?: {
    base_token?: { data?: { id?: string } };
    dex?: { data?: { id?: string } };
  };
};

type GeckoResponse = { data?: GeckoPool[]; included?: GeckoIncluded[] };

async function geckoTerminalFeed(): Promise<MarketToken[]> {
  const body = await fetchJson<GeckoResponse>(
    "https://api.geckoterminal.com/api/v2/networks/solana/new_pools?include=base_token&page=1",
    { headers: { Accept: "application/json;version=20230203" } },
  );

  const tokenInfo = new Map<string, GeckoIncluded>();
  for (const item of body.included || []) if (item.id) tokenInfo.set(item.id, item);

  const tokens: MarketToken[] = [];
  for (const pool of body.data || []) {
    const a = pool.attributes || {};
    const baseId = pool.relationships?.base_token?.data?.id || "";
    const mint = baseId.startsWith("solana_") ? baseId.slice(7) : baseId;
    if (!mint || !a.address) continue;

    const included = tokenInfo.get(baseId)?.attributes;
    const pairName = (a.name || "Unknown / SOL").split(" / ")[0] || "Unknown";
    const symbol = included?.symbol || pairName.replace(/^\$/, "").slice(0, 16) || "???";
    const priceUsd = Number(a.base_token_price_usd || 0);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) continue;

    tokens.push({
      mint,
      pairAddress: a.address,
      name: included?.name || pairName,
      symbol,
      image: included?.image_url,
      priceUsd,
      priceNative: Number(a.base_token_price_native_currency || 0),
      marketCap: Number(a.market_cap_usd || a.fdv_usd || 0),
      liquidityUsd: Number(a.reserve_in_usd || 0),
      volume24h: Number(a.volume_usd?.h24 || 0),
      priceChange24h: Number(a.price_change_percentage?.h24 || 0),
      buys24h: Number(a.transactions?.h24?.buys || 0),
      sells24h: Number(a.transactions?.h24?.sells || 0),
      pairCreatedAt: a.pool_created_at ? Date.parse(a.pool_created_at) : undefined,
      dexId: pool.relationships?.dex?.data?.id || "geckoterminal",
    });
  }

  tokens.sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0));
  if (!tokens.length) throw new Error("GeckoTerminal returned no usable Solana pools");
  return tokens;
}

export async function GET() {
  const now = Date.now();
  if (lastGood && now - lastGood.at < CACHE_MS) {
    return NextResponse.json({ tokens: lastGood.tokens, source: lastGood.source, live: true, cached: true, asOf: lastGood.at });
  }

  const errors: string[] = [];
  try {
    const tokens = await dexScreenerFeed();
    lastGood = { at: now, tokens, source: "dexscreener" };
    return NextResponse.json({ tokens, source: "dexscreener", live: true, asOf: now });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "DexScreener failed");
    console.error("market_latest_dexscreener_error", error);
  }

  try {
    const tokens = await geckoTerminalFeed();
    lastGood = { at: now, tokens, source: "geckoterminal" };
    return NextResponse.json({ tokens, source: "geckoterminal", live: true, fallback: true, asOf: now });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "GeckoTerminal failed");
    console.error("market_latest_geckoterminal_error", error);
  }

  if (lastGood) {
    return NextResponse.json({
      tokens: lastGood.tokens,
      source: lastGood.source,
      live: false,
      stale: true,
      asOf: lastGood.at,
      warning: errors.join("; "),
    });
  }

  return NextResponse.json({ tokens: [], error: errors.join("; ") || "market feed unavailable" }, { status: 502 });
}
