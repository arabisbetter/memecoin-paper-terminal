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
  volume5m?: number;
  volume1h?: number;
  volume6h?: number;
  volume24h: number;
  priceChange5m?: number;
  priceChange1h?: number;
  priceChange6h?: number;
  priceChange24h: number;
  buys5m?: number;
  sells5m?: number;
  buys1h?: number;
  sells1h?: number;
  buys6h?: number;
  sells6h?: number;
  buys24h: number;
  sells24h: number;
  pairCreatedAt?: number;
  dexId?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  boostsActive?: number;
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

export type MarketTrade = {
  kind: 'buy' | 'sell';
  volumeUsd: number;
  priceUsd: number;
  txHash: string;
  trader?: string;
  timestamp: string;
};
