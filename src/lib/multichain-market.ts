import type { MarketToken } from './types'

export type SupportedChain='base'|'ethereum'
export const CHAIN_CONFIG:Record<SupportedChain,{label:string;native:string;gecko:string;explorer:string}>={
  base:{label:'Base',native:'ETH',gecko:'base',explorer:'https://basescan.org'},
  ethereum:{label:'Ethereum',native:'ETH',gecko:'eth',explorer:'https://etherscan.io'},
}
export const isSupportedChain=(value:string):value is SupportedChain=>value==='base'||value==='ethereum'

type TxWindow={buys?:number;sells?:number}
type DexPair={
  chainId?:string;dexId?:string;pairAddress?:string;url?:string;
  baseToken?:{address?:string;name?:string;symbol?:string};
  priceUsd?:string;priceNative?:string;marketCap?:number;fdv?:number;
  liquidity?:{usd?:number};volume?:{m5?:number;h1?:number;h6?:number;h24?:number};
  priceChange?:{m5?:number;h1?:number;h6?:number;h24?:number};
  txns?:{m5?:TxWindow;h1?:TxWindow;h6?:TxWindow;h24?:TxWindow};pairCreatedAt?:number;
  info?:{imageUrl?:string;websites?:Array<{url?:string}>;socials?:Array<{platform?:string;handle?:string;url?:string}>};boosts?:{active?:number};
}
type Link={type?:string;label?:string;url?:string}
type Profile={chainId?:string;tokenAddress?:string;icon?:string;description?:string;url?:string;links?:Link[]}
type GeckoIncluded={id?:string;attributes?:{name?:string;symbol?:string;image_url?:string}}
type GeckoPool={attributes?:{address?:string;name?:string;base_token_price_usd?:string;base_token_price_native_currency?:string;market_cap_usd?:string|null;fdv_usd?:string|null;reserve_in_usd?:string|null;pool_created_at?:string;price_change_percentage?:{m5?:string;h1?:string;h6?:string;h24?:string};volume_usd?:{m5?:string;h1?:string;h6?:string;h24?:string};transactions?:{m5?:TxWindow;h1?:TxWindow;h6?:TxWindow;h24?:TxWindow}};relationships?:{base_token?:{data?:{id?:string}};dex?:{data?:{id?:string}}}}
type GeckoResponse={data?:GeckoPool[];included?:GeckoIncluded[]}

const n=(v:unknown)=>{const x=Number(v??0);return Number.isFinite(x)?x:0}
const chunks=<T,>(a:T[],size:number)=>Array.from({length:Math.ceil(a.length/size)},(_,i)=>a.slice(i*size,(i+1)*size))
async function fetchJson<T>(url:string,timeout=8000):Promise<T>{const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{cache:'no-store',signal:c.signal,headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`${new URL(url).hostname} ${r.status}`);return await r.json() as T}finally{clearTimeout(timer)}}
function social(pair:DexPair,platform:string){const item=pair.info?.socials?.find(s=>String(s.platform||'').toLowerCase()===platform);if(!item)return undefined;if(item.url)return item.url;const h=String(item.handle||'').replace(/^@/,'');if(!h)return undefined;if(platform==='twitter')return `https://x.com/${h}`;if(platform==='telegram')return `https://t.me/${h}`;return undefined}
function metaLink(profile:Profile|undefined,kind:'website'|'twitter'|'telegram'){return profile?.links?.find(l=>String(l.type||'').toLowerCase()===kind||String(l.label||'').toLowerCase().includes(kind))?.url}

export function normalizeChainPair(pair:DexPair,chain:SupportedChain):MarketToken|null{
  if(pair.chainId!==chain||!pair.baseToken?.address)return null
  return {chainId:chain,mint:pair.baseToken.address,pairAddress:pair.pairAddress,name:pair.baseToken.name||'Unknown',symbol:pair.baseToken.symbol||'???',image:pair.info?.imageUrl,pairUrl:pair.url,buyUrl:pair.url,priceUsd:n(pair.priceUsd),priceNative:n(pair.priceNative),marketCap:n(pair.marketCap??pair.fdv),liquidityUsd:n(pair.liquidity?.usd),volume5m:n(pair.volume?.m5),volume1h:n(pair.volume?.h1),volume6h:n(pair.volume?.h6),volume24h:n(pair.volume?.h24),priceChange5m:n(pair.priceChange?.m5),priceChange1h:n(pair.priceChange?.h1),priceChange6h:n(pair.priceChange?.h6),priceChange24h:n(pair.priceChange?.h24),buys5m:n(pair.txns?.m5?.buys),sells5m:n(pair.txns?.m5?.sells),buys1h:n(pair.txns?.h1?.buys),sells1h:n(pair.txns?.h1?.sells),buys6h:n(pair.txns?.h6?.buys),sells6h:n(pair.txns?.h6?.sells),buys24h:n(pair.txns?.h24?.buys),sells24h:n(pair.txns?.h24?.sells),pairCreatedAt:pair.pairCreatedAt,dexId:pair.dexId,website:pair.info?.websites?.find(w=>w.url)?.url,twitter:social(pair,'twitter'),telegram:social(pair,'telegram'),boostsActive:n(pair.boosts?.active)}
}

async function profiles(){const urls=['https://api.dexscreener.com/token-profiles/latest/v1','https://api.dexscreener.com/token-boosts/top/v1'];const settled=await Promise.allSettled(urls.map(u=>fetchJson<Profile[]>(u)));return settled.flatMap(r=>r.status==='fulfilled'&&Array.isArray(r.value)?r.value:[])}
function enrich(token:MarketToken,profile:Profile|undefined){if(!profile)return token;token.image=token.image||profile.icon;token.description=profile.description||token.description;token.profileUrl=profile.url||token.profileUrl;token.website=token.website||metaLink(profile,'website');token.twitter=token.twitter||metaLink(profile,'twitter');token.telegram=token.telegram||metaLink(profile,'telegram');return token}

async function geckoFeed(chain:SupportedChain):Promise<MarketToken[]>{
  const network=CHAIN_CONFIG[chain].gecko,body=await fetchJson<GeckoResponse>(`https://api.geckoterminal.com/api/v2/networks/${network}/new_pools?include=base_token&page=1`),included=new Map<string,GeckoIncluded>();for(const i of body.included||[])if(i.id)included.set(i.id,i)
  const out:MarketToken[]=[]
  for(const pool of body.data||[]){const a=pool.attributes||{},baseId=pool.relationships?.base_token?.data?.id||'',prefix=`${network}_`,address=baseId.startsWith(prefix)?baseId.slice(prefix.length):baseId;if(!address||!a.address)continue;const meta=included.get(baseId)?.attributes,price=n(a.base_token_price_usd);if(price<=0)continue;const pairName=(a.name||'Unknown / ETH').split(' / ')[0]||'Unknown',url=`https://www.geckoterminal.com/${network}/pools/${a.address}`;out.push({chainId:chain,mint:address,pairAddress:a.address,name:meta?.name||pairName,symbol:meta?.symbol||pairName.replace(/^\$/,'').slice(0,16)||'???',image:meta?.image_url,pairUrl:url,buyUrl:url,priceUsd:price,priceNative:n(a.base_token_price_native_currency),marketCap:n(a.market_cap_usd||a.fdv_usd),liquidityUsd:n(a.reserve_in_usd),volume5m:n(a.volume_usd?.m5),volume1h:n(a.volume_usd?.h1),volume6h:n(a.volume_usd?.h6),volume24h:n(a.volume_usd?.h24),priceChange5m:n(a.price_change_percentage?.m5),priceChange1h:n(a.price_change_percentage?.h1),priceChange6h:n(a.price_change_percentage?.h6),priceChange24h:n(a.price_change_percentage?.h24),buys5m:n(a.transactions?.m5?.buys),sells5m:n(a.transactions?.m5?.sells),buys1h:n(a.transactions?.h1?.buys),sells1h:n(a.transactions?.h1?.sells),buys6h:n(a.transactions?.h6?.buys),sells6h:n(a.transactions?.h6?.sells),buys24h:n(a.transactions?.h24?.buys),sells24h:n(a.transactions?.h24?.sells),pairCreatedAt:a.pool_created_at?Date.parse(a.pool_created_at):undefined,dexId:pool.relationships?.dex?.data?.id||'geckoterminal'})}
  return out.sort((a,b)=>(b.volume24h+b.liquidityUsd)-(a.volume24h+a.liquidityUsd)).slice(0,50)
}

export async function fetchChainFeed(chain:SupportedChain):Promise<{tokens:MarketToken[];source:string}>{
  const items=await profiles(),addresses=[...new Set(items.filter(i=>i.chainId===chain&&i.tokenAddress).map(i=>String(i.tokenAddress)))].slice(0,90),meta=new Map(items.filter(i=>i.chainId===chain&&i.tokenAddress).map(i=>[String(i.tokenAddress).toLowerCase(),i] as const))
  if(addresses.length){try{const groups=await Promise.all(chunks(addresses,30).map(g=>fetchJson<DexPair[]>(`https://api.dexscreener.com/tokens/v1/${chain}/${g.join(',')}`))),best=new Map<string,MarketToken>();for(const pair of groups.flat()){const token=normalizeChainPair(pair,chain);if(!token||token.priceUsd<=0)continue;enrich(token,meta.get(token.mint.toLowerCase()));const key=token.mint.toLowerCase(),prev=best.get(key);if(!prev||token.liquidityUsd>prev.liquidityUsd)best.set(key,token)}const tokens=[...best.values()].filter(t=>t.marketCap>0||t.liquidityUsd>0||t.volume24h>0).sort((a,b)=>(b.volume24h+b.liquidityUsd)-(a.volume24h+a.liquidityUsd)).slice(0,60);if(tokens.length)return{tokens,source:'dexscreener'}}catch{/* fallback below */}}
  const fallback=await geckoFeed(chain);if(!fallback.length)throw new Error(`No live ${CHAIN_CONFIG[chain].label} pools available`);return{tokens:fallback,source:'geckoterminal'}
}

export async function fetchChainToken(chain:SupportedChain,address:string):Promise<MarketToken|null>{
  const [pairs,items]=await Promise.all([fetchJson<DexPair[]>(`https://api.dexscreener.com/token-pairs/v1/${chain}/${encodeURIComponent(address)}`),profiles()]);const tokens=pairs.map(p=>normalizeChainPair(p,chain)).filter((t):t is MarketToken=>Boolean(t)).sort((a,b)=>b.liquidityUsd-a.liquidityUsd),token=tokens[0];if(!token)return null;return enrich(token,items.find(i=>i.chainId===chain&&String(i.tokenAddress).toLowerCase()===address.toLowerCase()))
}
