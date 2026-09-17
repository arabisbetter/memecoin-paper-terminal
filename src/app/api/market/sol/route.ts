import { NextResponse } from 'next/server'
import { normalizePair } from '@/lib/market'

export const dynamic='force-dynamic'
const WRAPPED_SOL='So11111111111111111111111111111111111111112'
let last:{at:number;priceUsd:number}|null=null

export async function GET(){
  const now=Date.now()
  if(last&&now-last.at<10_000)return NextResponse.json({...last,live:true,cached:true})
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6_000)
  try{
    const res=await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${WRAPPED_SOL}`,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}})
    if(!res.ok)throw new Error(`DexScreener ${res.status}`)
    const pairs=await res.json() as unknown[]
    const tokens=pairs.map(p=>normalizePair(p as never)).filter(Boolean).sort((a,b)=>(b?.liquidityUsd||0)-(a?.liquidityUsd||0))
    const priceUsd=Number(tokens[0]?.priceUsd||0)
    if(!Number.isFinite(priceUsd)||priceUsd<=0)throw new Error('SOL/USD unavailable')
    last={at:now,priceUsd}
    return NextResponse.json({priceUsd,asOf:now,live:true},{headers:{'Cache-Control':'public, s-maxage=8, stale-while-revalidate=30'}})
  }catch(error){
    if(last)return NextResponse.json({priceUsd:last.priceUsd,asOf:last.at,live:false,stale:true,warning:error instanceof Error?error.message:'SOL/USD unavailable'})
    return NextResponse.json({error:error instanceof Error?error.message:'SOL/USD unavailable'},{status:502})
  }finally{clearTimeout(timer)}
}
