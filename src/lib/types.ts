export type MarketToken = {
  mint: string;
  pairAddress?: string;
  name: string;
  symbol: string;
  image?: string;
  priceUsd: number;
  priceNative: number;
  marketCap: number;
  liquidityUsd: number;
  volume24h: number;
  priceChange24h: number;
  buys24h: number;
  sells24h: number;
  pairCreatedAt?: number;
  dexId?: string;
};

export type PaperPosition = {
  id: string;
  mint: string;
  symbol: string;
  amountSol: number;
  entryPriceUsd: number;
  entryMarketCap: number;
  currentPriceUsd: number;
  openedAt: string;
};
