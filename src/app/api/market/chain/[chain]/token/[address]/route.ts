import { NextRequest, NextResponse } from 'next/server'
import { CHAIN_CONFIG, fetchChainToken, isSupportedChain } from '@/lib/multichain-market'
import { readMarketFeedCache } from '@/lib/server/market-feed-cache'

export const dynamic='force-dynamic'
const evm=/^0x[a-fA-F0-9]{40}$/

export async function GET(_req:NextRequest,ctx:{params:Promise<{chain:string;address:string}>}){
  const {chain,address}=await ctx.params
  if(!isSupportedChain(chain))return NextResponse.json({error:'Unsupported chain'},{status:400})
  if(!evm.test(address))return NextResponse.json({error:'Invalid EVM token contract address'},{status:400})
  const feedCache=await readMarketFeedCache('chain:'+chain)
  const cached=feedCache?.tokens.find(t=>t.mint.toLowerCase()===address.toLowerCase())
  if(cached&&feedCache&&Date.now()-feedCache.at<30_000)return NextResponse.json({token:cached,chain,live:true,cached:true,asOf:feedCache.at},{headers:{'Cache-Control':'public, s-maxage=10, stale-while-revalidate=30'}})
  try{
    const token=await fetchChainToken(chain,address)
    if(!token)return NextResponse.json({error:`No active ${CHAIN_CONFIG[chain].label} market found for this contract.`},{status:404})
    return NextResponse.json({token,chain,live:true,asOf:Date.now()},{headers:{'Cache-Control':'public, s-maxage=10, stale-while-revalidate=30'}})
  }catch(error){
    console.error('multichain_token_error',{chain,address,error})
    if(cached&&feedCache)return NextResponse.json({token:cached,chain,live:false,stale:true,asOf:feedCache.at,warning:'Live contract refresh is temporarily limited.'})
    return NextResponse.json({error:error instanceof Error?error.message:'token lookup failed'},{status:502})
  }
}
