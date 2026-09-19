import { NextRequest, NextResponse } from 'next/server'
import { normalizePair } from '@/lib/market'
import type { MarketToken } from '@/lib/types'
import { readMarketFeedCache } from '@/lib/server/market-feed-cache'

export const dynamic='force-dynamic'

type ProfileLink={type?:string;label?:string;url?:string}
type DexProfile={chainId?:string;tokenAddress?:string;icon?:string;description?:string;url?:string;links?:ProfileLink[]}
const cache=new Map<string,{at:number;token:MarketToken}>()
const FRESH_MS=5_000
let profileCache:{at:number;items:DexProfile[]}|null=null

async function latestProfiles(){
  if(profileCache&&Date.now()-profileCache.at<300_000)return profileCache.items
  try{const r=await fetch('https://api.dexscreener.com/token-profiles/latest/v1',{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)return profileCache?.items||[];const body=await r.json() as DexProfile[];profileCache={at:Date.now(),items:Array.isArray(body)?body:[]};return profileCache.items}catch{return profileCache?.items||[]}
}
function profileLink(profile:DexProfile|undefined,kind:'website'|'twitter'|'telegram'|'buy'){
  const links=profile?.links||[]
  if(kind==='buy')return links.find(l=>/pump\.fun|jup\.ag|raydium\.io|meteora|dexscreener\.com/i.test(String(l.url||'')))?.url
  return links.find(l=>String(l.type||'').toLowerCase()===kind||String(l.label||'').toLowerCase().includes(kind))?.url
}

export async function GET(_req:NextRequest,ctx:{params:Promise<{mint:string}>}){
  const {mint}=await ctx.params
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))return NextResponse.json({error:'Invalid mint'},{status:400})
  const previous=cache.get(mint)
  if(previous&&Date.now()-previous.at<FRESH_MS)return NextResponse.json({token:previous.token,live:true,cached:true,asOf:previous.at})
  const feedCache=await readMarketFeedCache('solana:latest')
  const feedToken=feedCache?.tokens.find(t=>t.mint===mint)
  if(feedToken&&feedCache&&Date.now()-feedCache.at<8_000)return NextResponse.json({token:feedToken,live:true,cached:true,asOf:feedCache.at,metadata:'market-feed-cache'})

  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7_000)
  try{
    const [res,profiles]=await Promise.all([fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${encodeURIComponent(mint)}`,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}}),latestProfiles()])
    if(!res.ok)throw new Error(`DexScreener ${res.status}`)
    const pairs=await res.json() as unknown[]
    const tokens=pairs.map(p=>normalizePair(p as never)).filter((t):t is MarketToken=>Boolean(t)).sort((a,b)=>b.liquidityUsd-a.liquidityUsd)
    const token=tokens[0]
    if(!token)return NextResponse.json({error:'Token found, but no supported active Solana market was detected.'},{status:404})
    const profile=profiles.find(p=>p.chainId==='solana'&&p.tokenAddress===mint)
    if(profile){token.description=profile.description||token.description;token.profileUrl=profile.url||token.profileUrl;token.image=token.image||profile.icon;token.website=token.website||profileLink(profile,'website');token.twitter=token.twitter||profileLink(profile,'twitter');token.telegram=token.telegram||profileLink(profile,'telegram');token.buyUrl=profileLink(profile,'buy')||token.buyUrl||token.pairUrl}
    cache.set(mint,{at:Date.now(),token})
    return NextResponse.json({token,live:true,asOf:Date.now(),metadata:profile?'dexscreener-profile':'pair-info'},{headers:{'Cache-Control':'public, s-maxage=4, stale-while-revalidate=15'}})
  }catch(error){
    console.error('market_token_lookup_error',{mint,error})
    if(previous)return NextResponse.json({token:previous.token,live:false,stale:true,asOf:previous.at,warning:error instanceof Error?error.message:'lookup failed'})
    if(feedToken&&feedCache)return NextResponse.json({token:feedToken,live:false,stale:true,asOf:feedCache.at,warning:'Live token refresh is temporarily limited. Showing the last real market snapshot.'})
    return NextResponse.json({error:error instanceof Error?error.message:'lookup failed'},{status:502})
  }finally{clearTimeout(timer)}
}
