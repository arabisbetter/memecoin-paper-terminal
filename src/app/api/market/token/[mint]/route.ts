import { NextRequest, NextResponse } from 'next/server'
import { normalizePair } from '@/lib/market'
import type { MarketToken } from '@/lib/types'

export const dynamic='force-dynamic'

const cache=new Map<string,{at:number;token:MarketToken}>()
const FRESH_MS=5_000

export async function GET(_req:NextRequest,ctx:{params:Promise<{mint:string}>}){
  const {mint}=await ctx.params
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))return NextResponse.json({error:'Invalid mint'},{status:400})
  const previous=cache.get(mint)
  if(previous&&Date.now()-previous.at<FRESH_MS)return NextResponse.json({token:previous.token,live:true,cached:true,asOf:previous.at})

  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),7_000)
  try{
    const res=await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${encodeURIComponent(mint)}`,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}})
    if(!res.ok)throw new Error(`DexScreener ${res.status}`)
    const pairs=await res.json() as unknown[]
    const tokens=pairs.map(p=>normalizePair(p as never)).filter((t):t is MarketToken=>Boolean(t)).sort((a,b)=>b.liquidityUsd-a.liquidityUsd)
    const token=tokens[0]
    if(!token)return NextResponse.json({error:'Token not found'},{status:404})
    cache.set(mint,{at:Date.now(),token})
    return NextResponse.json({token,live:true,asOf:Date.now()},{headers:{'Cache-Control':'public, s-maxage=4, stale-while-revalidate=15'}})
  }catch(error){
    console.error('market_token_lookup_error',{mint,error})
    if(previous)return NextResponse.json({token:previous.token,live:false,stale:true,asOf:previous.at,warning:error instanceof Error?error.message:'lookup failed'})
    return NextResponse.json({error:error instanceof Error?error.message:'lookup failed'},{status:502})
  }finally{clearTimeout(timer)}
}
