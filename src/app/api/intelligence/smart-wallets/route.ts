import { NextRequest, NextResponse } from 'next/server'

export const dynamic='force-dynamic'
type Token={pairAddress?:string;symbol?:string}
type TradeRow={attributes?:{tx_from_address?:string;volume_in_usd?:string|number;kind?:string}}
type WalletScore={address:string;score?:{value?:number;label?:string;confidence?:number};metrics?:Record<string,unknown>;profitability?:unknown;live?:boolean;source?:string[]}

export async function GET(req:NextRequest){
  try{
    const origin=req.nextUrl.origin
    const marketRes=await fetch(origin+'/api/market/latest',{cache:'no-store'})
    const market=await marketRes.json()
    if(!marketRes.ok||!Array.isArray(market.tokens))throw new Error(market.error||'Live market feed unavailable')
    const tokens=(market.tokens as Token[]).filter(t=>t.pairAddress).slice(0,8)
    const walletVolume=new Map<string,number>()
    for(const token of tokens){
      try{
        const r=await fetch('https://api.geckoterminal.com/api/v2/networks/solana/pools/'+encodeURIComponent(String(token.pairAddress))+'/trades',{cache:'no-store',headers:{Accept:'application/json;version=20230203'}})
        if(!r.ok)continue
        const j=await r.json() as {data?:TradeRow[]}
        for(const row of j.data||[]){
          const address=String(row.attributes?.tx_from_address||'')
          if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))continue
          walletVolume.set(address,(walletVolume.get(address)||0)+Number(row.attributes?.volume_in_usd||0))
        }
      }catch{}
      if(walletVolume.size>=12)break
    }
    const candidates=[...walletVolume.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4)
    const scored=(await Promise.all(candidates.map(async([address,observedVolumeUsd])=>{
      try{
        const r=await fetch(origin+'/api/intelligence/wallet/'+encodeURIComponent(address),{cache:'no-store'})
        const j=await r.json() as WalletScore
        return r.ok&&j.live?({...j,address,observedVolumeUsd} as WalletScore&{observedVolumeUsd:number}):null
      }catch{return null}
    }))).filter((row):row is WalletScore&{observedVolumeUsd:number}=>Boolean(row))
    scored.sort((a,b)=>Number(b.score?.value||0)-Number(a.score?.value||0))
    return NextResponse.json({wallets:scored,live:true,asOf:Date.now(),marketSource:market.source||'unknown',sampledPools:tokens.length,source:['geckoterminal-trades','solana-mainnet-rpc','dexscreener'],note:'Ranking is a live activity/portfolio-quality score, not a profitability claim. Exact realized P&L is intentionally not inferred.'},{headers:{'Cache-Control':'public, s-maxage=30, stale-while-revalidate=90'}})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Smart-wallet leaderboard unavailable'},{status:502})
  }
}
