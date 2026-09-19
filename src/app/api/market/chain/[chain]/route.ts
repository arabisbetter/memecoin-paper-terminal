import { NextRequest, NextResponse } from 'next/server'
import { CHAIN_CONFIG, fetchChainFeed, isSupportedChain, type SupportedChain } from '@/lib/multichain-market'
import type { MarketToken } from '@/lib/types'
import { readMarketFeedCache } from '@/lib/server/market-feed-cache'

export const dynamic='force-dynamic'
const cache=new Map<SupportedChain,{at:number;tokens:MarketToken[];source:string}>(),FRESH_MS=30_000,MAX_STALE_MS=30*60_000

export async function GET(_req:NextRequest,ctx:{params:Promise<{chain:string}>}){
  const {chain}=await ctx.params
  if(!isSupportedChain(chain))return NextResponse.json({error:'Unsupported chain'},{status:400})
  let previous=cache.get(chain)
  if(!previous){
    const durable=await readMarketFeedCache('chain:'+chain)
    if(durable){previous=durable;cache.set(chain,durable)}
  }
  if(previous&&Date.now()-previous.at<FRESH_MS)return NextResponse.json({chain,label:CHAIN_CONFIG[chain].label,tokens:previous.tokens,source:previous.source,live:true,cached:true,asOf:previous.at},{headers:{'Cache-Control':'public, s-maxage=15, stale-while-revalidate=60'}})
  try{
    const {tokens,source}=await fetchChainFeed(chain),at=Date.now()
    cache.set(chain,{at,tokens,source})
    return NextResponse.json({chain,label:CHAIN_CONFIG[chain].label,tokens,source,live:true,asOf:at},{headers:{'Cache-Control':'public, s-maxage=15, stale-while-revalidate=60'}})
  }catch(error){
    console.error('multichain_feed_error',{chain,error})
    if(previous&&Date.now()-previous.at<MAX_STALE_MS)return NextResponse.json({chain,label:CHAIN_CONFIG[chain].label,tokens:previous.tokens,source:previous.source,live:false,stale:true,asOf:previous.at,warning:'Live '+CHAIN_CONFIG[chain].label+' provider is temporarily limited. Showing the last real snapshot while PAPER retries.'})
    return NextResponse.json({error:error instanceof Error?error.message:'feed failed'},{status:502})
  }
}
