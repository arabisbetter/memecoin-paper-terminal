import { NextResponse } from 'next/server'
import type { MarketTrade } from '@/lib/types'

export const dynamic='force-dynamic'

type GeckoTrade={
  attributes?:{
    kind?:string;
    block_timestamp?:string;
    tx_hash?:string;
    tx_from_address?:string;
    volume_in_usd?:string|number;
    price_usd?:string|number;
    price_from_in_usd?:string|number;
    price_to_in_usd?:string|number;
  }
}
type GeckoTradesResponse={data?:GeckoTrade[]}
const cache=new Map<string,{at:number;trades:MarketTrade[]}>()
const CACHE_MS=4_500
const finite=(...values:unknown[])=>{for(const value of values){const n=Number(value);if(Number.isFinite(n)&&n>0)return n}return 0}

export async function GET(_req:Request,ctx:{params:Promise<{pool:string}>}){
  const {pool}=await ctx.params
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,60}$/.test(pool))return NextResponse.json({error:'Invalid pool address'},{status:400})
  const previous=cache.get(pool)
  if(previous&&Date.now()-previous.at<CACHE_MS)return NextResponse.json({trades:previous.trades,source:'geckoterminal',live:true,cached:true,asOf:previous.at})

  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8_000)
  try{
    const url=`https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(pool)}/trades`
    const response=await fetch(url,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json;version=20230203'}})
    if(!response.ok)throw new Error(`trades ${response.status}`)
    const json=await response.json() as GeckoTradesResponse
    const trades=(json.data||[]).map(item=>{
      const a=item.attributes||{},kind=String(a.kind||'').toLowerCase()==='sell'?'sell':'buy'
      return{kind,volumeUsd:finite(a.volume_in_usd),priceUsd:finite(a.price_usd,a.price_to_in_usd,a.price_from_in_usd),txHash:String(a.tx_hash||''),trader:a.tx_from_address?String(a.tx_from_address):undefined,timestamp:String(a.block_timestamp||'')} satisfies MarketTrade
    }).filter(t=>t.txHash&&t.timestamp).slice(0,60)
    cache.set(pool,{at:Date.now(),trades})
    return NextResponse.json({trades,source:'geckoterminal',live:true,asOf:Date.now()},{headers:{'Cache-Control':'public, s-maxage=4, stale-while-revalidate=20'}})
  }catch(error){
    console.error('market_trades_error',{pool,error})
    if(previous)return NextResponse.json({trades:previous.trades,source:'geckoterminal',live:false,stale:true,asOf:previous.at,warning:error instanceof Error?error.message:'trade tape unavailable'})
    return NextResponse.json({trades:[],error:error instanceof Error?error.message:'trade tape unavailable'},{status:502})
  }finally{clearTimeout(timer)}
}
