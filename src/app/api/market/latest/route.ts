import { NextResponse } from 'next/server'
import { normalizePair } from '@/lib/market'
import type { MarketToken } from '@/lib/types'

export const dynamic = 'force-dynamic'

let lastGood:{at:number;tokens:MarketToken[];source:string}|null=null
const CACHE_MS=2_500

type DiscoveryLink={label?:string;type?:string;url?:string}
type DiscoveryItem={chainId?:string;tokenAddress?:string;icon?:string;description?:string;url?:string;links?:DiscoveryLink[]}
type ObservedPoint={at:number;price:number;volume5m:number;buys5m:number;sells5m:number}
const observedHistory=new Map<string,ObservedPoint[]>()

type GeckoIncluded={id?:string;attributes?:{name?:string;symbol?:string;image_url?:string}}
type GeckoPool={
  attributes?:{
    address?:string;name?:string;base_token_price_usd?:string;base_token_price_native_currency?:string;
    market_cap_usd?:string|null;fdv_usd?:string|null;reserve_in_usd?:string|null;pool_created_at?:string;
    price_change_percentage?:{m5?:string;h1?:string;h6?:string;h24?:string};
    volume_usd?:{m5?:string;h1?:string;h6?:string;h24?:string};
    transactions?:{m5?:{buys?:number;sells?:number};h1?:{buys?:number;sells?:number};h6?:{buys?:number;sells?:number};h24?:{buys?:number;sells?:number}};
  };
  relationships?:{base_token?:{data?:{id?:string}};dex?:{data?:{id?:string}}};
}
type GeckoResponse={data?:GeckoPool[];included?:GeckoIncluded[]}

async function fetchJson<T>(url:string,timeoutMs=8_000):Promise<T>{
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),timeoutMs)
  try{
    const res=await fetch(url,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}})
    if(!res.ok)throw new Error(`${new URL(url).hostname} ${res.status}`)
    return await res.json() as T
  }finally{clearTimeout(timer)}
}

const chunks=<T,>(items:T[],size:number)=>Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size))
const lower=(v:unknown)=>String(v||'').toLowerCase()

function applyObservedMinute(tokens:MarketToken[],now:number){
  for(const token of tokens){
    const point:ObservedPoint={at:now,price:token.priceUsd,volume5m:Number(token.volume5m||0),buys5m:Number(token.buys5m||0),sells5m:Number(token.sells5m||0)}
    const history=observedHistory.get(token.mint)||[]
    const last=history[history.length-1]
    if(!last||now-last.at>=1_500)history.push(point)
    while(history.length&&history[0].at<now-90_000)history.shift()
    observedHistory.set(token.mint,history)
    const target=now-60_000
    let base:ObservedPoint|undefined
    for(const candidate of history){if(candidate.at<=target)base=candidate;else break}
    if(base&&base.price>0){
      token.priceChange1m=(token.priceUsd/base.price-1)*100
      token.volume1m=Math.max(0,Number(token.volume5m||0)-base.volume5m)
      token.buys1m=Math.max(0,Number(token.buys5m||0)-base.buys5m)
      token.sells1m=Math.max(0,Number(token.sells5m||0)-base.sells5m)
      token.observed1mReady=true
    }else{
      token.observed1mReady=false
    }
  }
}

function linkFrom(meta:DiscoveryItem|undefined,kind:'website'|'twitter'|'telegram'|'buy'){
  const links=meta?.links||[]
  if(kind==='buy')return links.find(l=>/pump\.fun|jup\.ag|raydium\.io\/swap|birdeye\.so\/token|dexscreener\.com/i.test(String(l.url||'')))?.url
  return links.find(l=>lower(l.type)===kind||lower(l.label).includes(kind))?.url
}

async function dexScreenerFeed():Promise<MarketToken[]>{
  const discoveryUrls=[
    'https://api.dexscreener.com/token-profiles/latest/v1',
    'https://api.dexscreener.com/token-boosts/latest/v1',
    'https://api.dexscreener.com/token-boosts/top/v1',
    'https://api.dexscreener.com/community-takeovers/latest/v1',
  ]
  const settled=await Promise.allSettled(discoveryUrls.map(url=>fetchJson<DiscoveryItem[]>(url)))
  const addresses:string[]=[]
  const metadata=new Map<string,DiscoveryItem>()
  for(const result of settled){
    if(result.status!=='fulfilled'||!Array.isArray(result.value))continue
    for(const item of result.value){
      if(item.chainId!=='solana'||!item.tokenAddress)continue
      addresses.push(item.tokenAddress)
      const previous=metadata.get(item.tokenAddress)||{}
      metadata.set(item.tokenAddress,{...previous,...item,links:item.links?.length?item.links:previous.links})
    }
  }
  const unique=[...new Set(addresses)].slice(0,90)
  if(!unique.length)throw new Error('DexScreener discovery returned no Solana tokens')

  const pairResponses=await Promise.all(chunks(unique,30).map(group=>fetchJson<unknown[]>(`https://api.dexscreener.com/tokens/v1/solana/${group.join(',')}`)))
  const bestByMint=new Map<string,MarketToken>()
  for(const raw of pairResponses.flat()){
    const token=normalizePair(raw as never)
    if(!token||token.priceUsd<=0)continue
    const meta=metadata.get(token.mint)
    if(!token.image&&meta?.icon)token.image=meta.icon
    if(meta?.description)token.description=meta.description
    if(meta?.url)token.profileUrl=meta.url
    token.website=token.website||linkFrom(meta,'website')
    token.twitter=token.twitter||linkFrom(meta,'twitter')
    token.telegram=token.telegram||linkFrom(meta,'telegram')
    token.buyUrl=linkFrom(meta,'buy')||token.pairUrl||meta?.url
    const previous=bestByMint.get(token.mint)
    if(!previous||token.liquidityUsd>previous.liquidityUsd)bestByMint.set(token.mint,token)
  }
  const tokens=[...bestByMint.values()]
    .filter(t=>t.marketCap>0||t.liquidityUsd>0||t.volume24h>0)
    .sort((a,b)=>(b.volume24h+b.liquidityUsd)-(a.volume24h+a.liquidityUsd))
    .slice(0,60)
  if(!tokens.length)throw new Error('DexScreener returned no usable Solana pairs')
  applyObservedMinute(tokens,Date.now())
  return tokens
}

async function geckoTerminalFeed():Promise<MarketToken[]>{
  const body=await fetchJson<GeckoResponse>('https://api.geckoterminal.com/api/v2/networks/solana/new_pools?include=base_token&page=1')
  const included=new Map<string,GeckoIncluded>()
  for(const item of body.included||[])if(item.id)included.set(item.id,item)
  const tokens:MarketToken[]=[]
  for(const pool of body.data||[]){
    const a=pool.attributes||{}
    const baseId=pool.relationships?.base_token?.data?.id||''
    const mint=baseId.startsWith('solana_')?baseId.slice(7):baseId
    if(!mint||!a.address)continue
    const meta=included.get(baseId)?.attributes
    const pairName=(a.name||'Unknown / SOL').split(' / ')[0]||'Unknown'
    const priceUsd=Number(a.base_token_price_usd||0)
    if(!Number.isFinite(priceUsd)||priceUsd<=0)continue
    const marketUrl=`https://www.geckoterminal.com/solana/pools/${a.address}`
    tokens.push({
      mint,pairAddress:a.address,name:meta?.name||pairName,symbol:meta?.symbol||pairName.replace(/^\$/,'').slice(0,16)||'???',image:meta?.image_url,
      pairUrl:marketUrl,buyUrl:marketUrl,
      priceUsd,priceNative:Number(a.base_token_price_native_currency||0),marketCap:Number(a.market_cap_usd||a.fdv_usd||0),liquidityUsd:Number(a.reserve_in_usd||0),
      volume5m:Number(a.volume_usd?.m5||0),volume1h:Number(a.volume_usd?.h1||0),volume6h:Number(a.volume_usd?.h6||0),volume24h:Number(a.volume_usd?.h24||0),
      priceChange5m:Number(a.price_change_percentage?.m5||0),priceChange1h:Number(a.price_change_percentage?.h1||0),priceChange6h:Number(a.price_change_percentage?.h6||0),priceChange24h:Number(a.price_change_percentage?.h24||0),
      buys5m:Number(a.transactions?.m5?.buys||0),sells5m:Number(a.transactions?.m5?.sells||0),buys1h:Number(a.transactions?.h1?.buys||0),sells1h:Number(a.transactions?.h1?.sells||0),buys6h:Number(a.transactions?.h6?.buys||0),sells6h:Number(a.transactions?.h6?.sells||0),buys24h:Number(a.transactions?.h24?.buys||0),sells24h:Number(a.transactions?.h24?.sells||0),
      pairCreatedAt:a.pool_created_at?Date.parse(a.pool_created_at):undefined,dexId:pool.relationships?.dex?.data?.id||'geckoterminal',
    })
  }
  if(!tokens.length)throw new Error('GeckoTerminal returned no usable Solana pools')
  applyObservedMinute(tokens,Date.now())
  return tokens
}

export async function GET(){
  const now=Date.now()
  if(lastGood&&now-lastGood.at<CACHE_MS)return NextResponse.json({tokens:lastGood.tokens,source:lastGood.source,live:true,cached:true,asOf:lastGood.at},{headers:{'Cache-Control':'public, s-maxage=2, stale-while-revalidate=8'}})

  const errors:string[]=[]
  try{
    const tokens=await dexScreenerFeed()
    lastGood={at:Date.now(),tokens,source:'dexscreener'}
    return NextResponse.json({tokens,source:'dexscreener',live:true,asOf:lastGood.at},{headers:{'Cache-Control':'public, s-maxage=2, stale-while-revalidate=8'}})
  }catch(error){
    errors.push(error instanceof Error?error.message:'DexScreener failed')
    console.error('market_latest_dexscreener_error',error)
  }

  try{
    const tokens=await geckoTerminalFeed()
    lastGood={at:Date.now(),tokens,source:'geckoterminal'}
    return NextResponse.json({tokens,source:'geckoterminal',live:true,fallback:true,asOf:lastGood.at},{headers:{'Cache-Control':'public, s-maxage=4, stale-while-revalidate=15'}})
  }catch(error){
    errors.push(error instanceof Error?error.message:'GeckoTerminal failed')
    console.error('market_latest_geckoterminal_error',error)
  }

  if(lastGood)return NextResponse.json({tokens:lastGood.tokens,source:lastGood.source,live:false,stale:true,asOf:lastGood.at,warning:errors.join('; ')})
  return NextResponse.json({tokens:[],error:errors.join('; ')||'market feed unavailable'},{status:502})
}
