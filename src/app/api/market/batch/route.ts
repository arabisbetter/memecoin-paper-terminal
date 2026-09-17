import { NextRequest, NextResponse } from 'next/server'
import { normalizePair } from '@/lib/market'
import type { MarketToken } from '@/lib/types'

export const dynamic='force-dynamic'
const cache=new Map<string,{at:number;tokens:MarketToken[]}>()
const CACHE_MS=8_000

export async function GET(req:NextRequest){
  const raw=req.nextUrl.searchParams.get('mints')||''
  const mints=[...new Set(raw.split(',').map(s=>s.trim()).filter(s=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)))].slice(0,30)
  if(!mints.length)return NextResponse.json({tokens:[]})
  const key=mints.slice().sort().join(',')
  const previous=cache.get(key)
  if(previous&&Date.now()-previous.at<CACHE_MS)return NextResponse.json({tokens:previous.tokens,live:true,cached:true,asOf:previous.at})
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7_000)
  try{
    const response=await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mints.join(',')}`,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}})
    if(!response.ok)throw new Error(`DexScreener ${response.status}`)
    const rawPairs=await response.json() as unknown[]
    const best=new Map<string,MarketToken>()
    for(const pair of rawPairs){
      const token=normalizePair(pair as never);if(!token)continue
      const prev=best.get(token.mint);if(!prev||token.liquidityUsd>prev.liquidityUsd)best.set(token.mint,token)
    }
    const tokens=[...best.values()];cache.set(key,{at:Date.now(),tokens})
    return NextResponse.json({tokens,live:true,asOf:Date.now()},{headers:{'Cache-Control':'public, s-maxage=6, stale-while-revalidate=20'}})
  }catch(error){
    if(previous)return NextResponse.json({tokens:previous.tokens,live:false,stale:true,asOf:previous.at,warning:error instanceof Error?error.message:'batch lookup failed'})
    return NextResponse.json({tokens:[],error:error instanceof Error?error.message:'batch lookup failed'},{status:502})
  }finally{clearTimeout(timer)}
}
