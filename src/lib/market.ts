import type { MarketToken } from "./types";

type DexPair = {
  chainId?: string; dexId?: string; pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string; priceNative?: string; marketCap?: number; fdv?: number;
  liquidity?: { usd?: number }; volume?: { h24?: number };
  priceChange?: { h24?: number }; txns?: { h24?: { buys?: number; sells?: number } };
  pairCreatedAt?: number; info?: { imageUrl?: string };
};

export function normalizePair(pair: DexPair): MarketToken | null {
  if (pair.chainId !== "solana" || !pair.baseToken?.address) return null;
  return {
    mint: pair.baseToken.address,
    pairAddress: pair.pairAddress,
    name: pair.baseToken.name || "Unknown",
    symbol: pair.baseToken.symbol || "???",
    image: pair.info?.imageUrl,
    priceUsd: Number(pair.priceUsd || 0),
    priceNative: Number(pair.priceNative || 0),
    marketCap: Number(pair.marketCap || pair.fdv || 0),
    liquidityUsd: Number(pair.liquidity?.usd || 0),
    volume24h: Number(pair.volume?.h24 || 0),
    priceChange24h: Number(pair.priceChange?.h24 || 0),
    buys24h: Number(pair.txns?.h24?.buys || 0),
    sells24h: Number(pair.txns?.h24?.sells || 0),
    pairCreatedAt: pair.pairCreatedAt,
    dexId: pair.dexId,
  };
}
