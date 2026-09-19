import type { MarketToken } from '@/lib/types'

type CachedFeed={tokens:MarketToken[];source:string;at:number}
function validToken(value:unknown):value is MarketToken{
  const t=value as Partial<MarketToken>|null
  return Boolean(t&&typeof t.mint==='string'&&t.mint&&Number.isFinite(Number(t.priceUsd))&&Number(t.priceUsd)>0)
}
export async function readMarketFeedCache(cacheKey:string):Promise<CachedFeed|null>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if(!url||!key)return null
  try{
    const endpoint=new URL('/rest/v1/paper_market_feed_cache',url)
    endpoint.searchParams.set('select','payload,source,fetched_at')
    endpoint.searchParams.set('cache_key','eq.'+cacheKey)
    endpoint.searchParams.set('limit','1')
    const r=await fetch(endpoint,{cache:'no-store',headers:{Accept:'application/json',apikey:key}})
    if(!r.ok)return null
    const rows=await r.json() as Array<{payload?:unknown;source?:string;fetched_at?:string}>
    const data=rows[0]
    if(!data)return null
    const payload:any=data.payload
    const raw=Array.isArray(payload)?payload:Array.isArray(payload?.tokens)?payload.tokens:[]
    const tokens=(raw as unknown[]).filter(validToken)
    const at=Date.parse(String(data.fetched_at||''))
    if(!tokens.length||!Number.isFinite(at))return null
    return{tokens,source:String(data.source||'market-cache'),at}
  }catch{return null}
}
