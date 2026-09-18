import type { MarketToken } from './types'

type TxWindow={buys?:number;sells?:number}
type DexPair = {
  chainId?: string; dexId?: string; pairAddress?: string; url?:string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string; priceNative?: string; marketCap?: number; fdv?: number;
  liquidity?: { usd?: number };
  volume?: { m5?:number;h1?:number;h6?:number;h24?:number };
  priceChange?: { m5?:number;h1?:number;h6?:number;h24?:number };
  txns?: { m5?:TxWindow;h1?:TxWindow;h6?:TxWindow;h24?:TxWindow };
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: Array<{url?:string}>;
    socials?: Array<{platform?:string;handle?:string;url?:string}>;
  };
  boosts?:{active?:number};
}

const n=(value:unknown)=>{const parsed=Number(value??0);return Number.isFinite(parsed)?parsed:0}
const firstPositive=(...values:unknown[])=>{for(const value of values){const parsed=Number(value);if(Number.isFinite(parsed)&&parsed>0)return parsed}return 0}

export function normalizePair(pair: DexPair): MarketToken | null {
  if (pair.chainId !== 'solana' || !pair.baseToken?.address) return null
  const socials=pair.info?.socials||[]
  const socialUrl=(platform:string)=>{
    const item=socials.find(s=>String(s.platform||'').toLowerCase()===platform)
    if(!item)return undefined
    if(item.url)return item.url
    const handle=String(item.handle||'').replace(/^@/,'')
    if(!handle)return undefined
    if(platform==='twitter')return `https://x.com/${handle}`
    if(platform==='telegram')return `https://t.me/${handle}`
    return undefined
  }
  return {
    mint: pair.baseToken.address,
    pairAddress: pair.pairAddress,
    name: pair.baseToken.name || 'Unknown',
    symbol: pair.baseToken.symbol || '???',
    image: pair.info?.imageUrl,
    pairUrl:pair.url,
    buyUrl:pair.url,
    priceUsd: n(pair.priceUsd),
    priceNative: n(pair.priceNative),
    marketCap: firstPositive(pair.marketCap,pair.fdv),
    liquidityUsd: n(pair.liquidity?.usd),
    volume5m:n(pair.volume?.m5),
    volume1h:n(pair.volume?.h1),
    volume6h:n(pair.volume?.h6),
    volume24h: n(pair.volume?.h24),
    priceChange5m:n(pair.priceChange?.m5),
    priceChange1h:n(pair.priceChange?.h1),
    priceChange6h:n(pair.priceChange?.h6),
    priceChange24h: n(pair.priceChange?.h24),
    buys5m:n(pair.txns?.m5?.buys),
    sells5m:n(pair.txns?.m5?.sells),
    buys1h:n(pair.txns?.h1?.buys),
    sells1h:n(pair.txns?.h1?.sells),
    buys6h:n(pair.txns?.h6?.buys),
    sells6h:n(pair.txns?.h6?.sells),
    buys24h: n(pair.txns?.h24?.buys),
    sells24h: n(pair.txns?.h24?.sells),
    pairCreatedAt: pair.pairCreatedAt,
    dexId: pair.dexId,
    website:pair.info?.websites?.find(w=>w.url)?.url,
    twitter:socialUrl('twitter'),
    telegram:socialUrl('telegram'),
    boostsActive:n(pair.boosts?.active),
  }
}
