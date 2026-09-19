import { NextRequest, NextResponse } from 'next/server'

export const dynamic='force-dynamic'
const RPCS=[
  ...(process.env.HELIUS_API_KEY?[{url:'https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(process.env.HELIUS_API_KEY),name:'helius'}]:[]),
  {url:'https://api.mainnet.solana.com',name:'solana-official'},
  {url:'https://api.mainnet-beta.solana.com',name:'solana-mainnet-beta'},
  {url:'https://solana-rpc.publicnode.com',name:'publicnode'},
  {url:'https://rpc.ankr.com/solana',name:'ankr'},
]
const TOKEN_PROGRAM='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const valid=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/
type RpcResult<T>={result?:T;error?:{message?:string}}
type Sig={signature:string;err:unknown;blockTime?:number|null}
type TokenAccount={account?:{data?:{parsed?:{info?:{mint?:string;tokenAmount?:{uiAmount?:number|null;uiAmountString?:string}}}}}}
type DexPair={chainId?:string;baseToken?:{address?:string;name?:string;symbol?:string};priceUsd?:string;liquidity?:{usd?:number}}
type Meta={symbol?:string;name?:string;priceUsd:number;liquidity:number}

async function rpc<T>(method:string,params:unknown[]):Promise<T>{
  const controllers=RPCS.map(()=>new AbortController())
  const tasks=RPCS.map(async(endpoint,i)=>{
    const timer=setTimeout(()=>controllers[i].abort(),9000)
    try{
      const r=await fetch(endpoint.url,{method:'POST',cache:'no-store',signal:controllers[i].signal,headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})
      if(!r.ok)throw new Error(endpoint.name+' RPC '+r.status)
      const body=await r.json() as RpcResult<T>
      if(body.error)throw new Error(body.error.message||endpoint.name+' RPC error')
      if(body.result===undefined)throw new Error(endpoint.name+' RPC returned no result')
      return body.result
    }finally{clearTimeout(timer)}
  })
  try{
    const value=await Promise.any(tasks)
    controllers.forEach(c=>c.abort())
    return value
  }catch(error){
    throw error instanceof Error?error:new Error('All Solana RPC endpoints failed')
  }
}
const chunks=<T,>(a:T[],n:number)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,(i+1)*n))
async function dexMetadata(mints:string[]){
  const out=new Map<string,Meta>()
  for(const group of chunks(mints.slice(0,60),30)){
    try{
      const r=await fetch('https://api.dexscreener.com/tokens/v1/solana/'+group.join(','),{cache:'no-store',headers:{Accept:'application/json'}})
      if(!r.ok)continue
      const pairs=await r.json() as DexPair[]
      for(const p of pairs){
        if(p.chainId!=='solana'||!p.baseToken?.address)continue
        const key=p.baseToken.address,liq=Number(p.liquidity?.usd||0),prev=out.get(key)
        if(!prev||liq>prev.liquidity)out.set(key,{symbol:p.baseToken.symbol,name:p.baseToken.name,priceUsd:Number(p.priceUsd||0),liquidity:liq})
      }
    }catch{}
  }
  return out
}
function clamp(n:number){return Math.max(0,Math.min(100,Math.round(n)))}

export async function GET(_req:NextRequest,ctx:{params:Promise<{address:string}>}){
  const {address}=await ctx.params
  if(!valid.test(address))return NextResponse.json({error:'Invalid Solana wallet address'},{status:400})
  try{
    const now=Date.now()/1000
    const [balanceResult,signatures,tokenResult]=await Promise.all([
      rpc<{value:number}>('getBalance',[address,{commitment:'confirmed'}]),
      rpc<Sig[]>('getSignaturesForAddress',[address,{limit:40,commitment:'confirmed'}]),
      rpc<{value:TokenAccount[]}>('getTokenAccountsByOwner',[address,{programId:TOKEN_PROGRAM},{encoding:'jsonParsed',commitment:'confirmed'}]),
    ])
    const raw=(tokenResult.value||[]).map(row=>{
      const info=row.account?.data?.parsed?.info
      return{mint:String(info?.mint||''),amount:Number(info?.tokenAmount?.uiAmount??info?.tokenAmount?.uiAmountString??0)}
    }).filter(x=>x.mint&&x.amount>0).sort((a,b)=>b.amount-a.amount).slice(0,60)
    const meta=await dexMetadata(raw.map(x=>x.mint))
    const holdings=raw.map(h=>{
      const m=meta.get(h.mint),priceUsd=Number(m?.priceUsd||0),valueUsd=priceUsd>0?h.amount*priceUsd:0
      return{...h,symbol:m?.symbol||null,name:m?.name||null,priceUsd,liquidityUsd:Number(m?.liquidity||0),valueUsd}
    }).sort((a,b)=>b.valueUsd-a.valueUsd)
    const priced=holdings.filter(h=>h.valueUsd>0),portfolioValueUsd=priced.reduce((s,h)=>s+h.valueUsd,0)
    const successful=(signatures||[]).filter(s=>!s.err)
    const txSuccessRate=signatures.length?successful.length/signatures.length*100:0
    const active24h=(signatures||[]).filter(s=>Number(s.blockTime||0)>=now-86400).length
    const active7d=(signatures||[]).filter(s=>Number(s.blockTime||0)>=now-7*86400).length
    const topShare=portfolioValueUsd>0?Number(priced[0]?.valueUsd||0)/portfolioValueUsd*100:0
    const liquidShare=portfolioValueUsd>0?priced.filter(h=>h.liquidityUsd>=25000).reduce((s,h)=>s+h.valueUsd,0)/portfolioValueUsd*100:0
    const diversificationScore=portfolioValueUsd>0?clamp(100-topShare):0
    const activityScore=clamp(active24h*7+active7d*2)
    const reliabilityScore=clamp(txSuccessRate)
    const liquidityQualityScore=clamp(liquidShare)
    const coverage=Math.min(100,Math.round((signatures.length/40)*50+(priced.length/Math.max(1,raw.length))*50))
    const smartScore=clamp(reliabilityScore*.3+activityScore*.25+diversificationScore*.2+liquidityQualityScore*.25)
    const label=smartScore>=80?'HIGH SIGNAL':smartScore>=65?'STRONG':smartScore>=50?'ACTIVE':'LOW CONFIDENCE'
    return NextResponse.json({
      address,live:true,asOf:Date.now(),source:['solana-mainnet-rpc','dexscreener'],
      score:{value:smartScore,label,confidence:coverage,components:{reliability:reliabilityScore,activity:activityScore,diversification:diversificationScore,liquidityQuality:liquidityQualityScore}},
      metrics:{balanceSol:Number(balanceResult.value||0)/1e9,portfolioValueUsd,pricedHoldings:priced.length,totalTokenHoldings:raw.length,topHoldingSharePct:topShare,liquidHoldingSharePct:liquidShare,txSuccessRatePct:txSuccessRate,active24h,active7d,lastActivityAt:signatures[0]?.blockTime?new Date(Number(signatures[0].blockTime)*1000).toISOString():null},
      profitability:{available:false,reason:'Exact realized P&L and win rate require historical cost-basis reconstruction that public RPC signatures alone do not provide reliably.'},
      topHoldings:priced.slice(0,8),
      recent:signatures.slice(0,12).map(s=>({signature:s.signature,status:s.err?'failed':'success',blockTime:s.blockTime||null}))
    },{headers:{'Cache-Control':'public, s-maxage=20, stale-while-revalidate=60'}})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Wallet intelligence unavailable'},{status:502})
  }
}
