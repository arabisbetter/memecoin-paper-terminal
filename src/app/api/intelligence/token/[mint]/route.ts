import { NextRequest, NextResponse } from 'next/server'

export const dynamic='force-dynamic'
const RPCS=['https://api.mainnet-beta.solana.com','https://solana-rpc.publicnode.com']
const valid=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/
type RpcResult<T>={result?:T;error?:{message?:string}}
type Largest={address:string;amount:string;uiAmount?:number|null;uiAmountString?:string}
type Pair={chainId?:string;dexId?:string;pairAddress?:string;priceUsd?:string;marketCap?:number;fdv?:number;liquidity?:{usd?:number};pairCreatedAt?:number;baseToken?:{address?:string;symbol?:string;name?:string}}
type Gecko={data?:{attributes?:{ohlcv_list?:Array<[number,number,number,number,number,number]>}}}
async function rpc<T>(method:string,params:unknown[]):Promise<T>{
  let lastError:unknown=null
  for(const endpoint of RPCS){
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),3500)
    try{
      const r=await fetch(endpoint,{method:'POST',cache:'no-store',signal:c.signal,headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})
      if(!r.ok)throw new Error('Solana RPC '+r.status)
      const body=await r.json() as RpcResult<T>
      if(body.error)throw new Error(body.error.message||'Solana RPC error')
      if(body.result===undefined)throw new Error('Solana RPC returned no result')
      return body.result
    }catch(error){lastError=error}
    finally{clearTimeout(timer)}
  }
  throw lastError instanceof Error?lastError:new Error('All Solana RPC endpoints failed')
}
async function bestPair(mint:string){
  const r=await fetch('https://api.dexscreener.com/token-pairs/v1/solana/'+encodeURIComponent(mint),{cache:'no-store',headers:{Accept:'application/json'}})
  if(!r.ok)throw new Error('DexScreener '+r.status)
  const rows=await r.json() as Pair[]
  const validRows=(Array.isArray(rows)?rows:[]).filter(p=>p.chainId==='solana'&&String(p.baseToken?.address||'')===mint&&Number(p.priceUsd)>0)
  validRows.sort((a,b)=>Number(b.liquidity?.usd||0)-Number(a.liquidity?.usd||0))
  if(!validRows.length)throw new Error('No active Solana market found')
  return validRows[0]
}
function pct(raw:bigint,total:bigint){return total>BigInt(0)?Number(raw*BigInt(1000000)/total)/10000:0}
function stage(ageSeconds:number){return ageSeconds<900?'LAUNCH':ageSeconds<21600?'EARLY':ageSeconds<86400?'DAY ONE':ageSeconds<604800?'FIRST WEEK':'ESTABLISHED'}

export async function GET(_req:NextRequest,ctx:{params:Promise<{mint:string}>}){
  const {mint}=await ctx.params
  if(!valid.test(mint))return NextResponse.json({error:'Invalid Solana mint'},{status:400})
  try{
    const pair=await bestPair(mint)
    const [mintRes,largestRes]=await Promise.all([
      rpc<{value:any}>('getAccountInfo',[mint,{encoding:'jsonParsed',commitment:'confirmed'}]),
      rpc<{value:Largest[]}>('getTokenLargestAccounts',[mint,{commitment:'confirmed'}]),
    ])
    const mintInfo=mintRes.value?.data?.parsed?.info||null
    const largest=(largestRes.value||[]).slice(0,20)
    const accounts=largest.map(x=>x.address).filter(Boolean)
    const ownerRows=accounts.length?await rpc<{value:any[]}>('getMultipleAccounts',[accounts,{encoding:'jsonParsed',commitment:'confirmed'}]):{value:[]}
    const supplyRaw=BigInt(String(mintInfo?.supply||'0'))
    const holders=largest.map((row,i)=>{
      let raw=BigInt(0);try{raw=BigInt(String(row.amount||'0'))}catch{}
      const owner=String(ownerRows.value?.[i]?.data?.parsed?.info?.owner||'')
      return{rank:i+1,tokenAccount:row.address,owner:owner||null,amountUi:Number(row.uiAmount??row.uiAmountString??0),pct:pct(raw,supplyRaw)}
    })
    const top10Pct=holders.slice(0,10).reduce((s,h)=>s+h.pct,0)
    const top20Pct=holders.reduce((s,h)=>s+h.pct,0)
    const priceUsd=Number(pair.priceUsd||0),marketCap=Number(pair.marketCap??pair.fdv??0),liquidityUsd=Number(pair.liquidity?.usd||0)
    const pairCreatedAt=Number(pair.pairCreatedAt||0),ageSeconds=pairCreatedAt?Math.max(0,Math.round((Date.now()-pairCreatedAt)/1000)):0

    let observedHigh:number|null=null,observedLow:number|null=null,observedSince:number|null=null
    try{
      const r=await fetch('https://api.geckoterminal.com/api/v2/networks/solana/pools/'+encodeURIComponent(String(pair.pairAddress||''))+'/ohlcv/day?aggregate=1&limit=300&currency=usd&token=base&include_empty_intervals=false',{cache:'no-store',headers:{Accept:'application/json;version=20230203'}})
      if(r.ok){
        const j=await r.json() as Gecko
        const rows=j.data?.attributes?.ohlcv_list||[]
        if(rows.length){
          observedHigh=Math.max(...rows.map(x=>Number(x[2])).filter(Number.isFinite))
          observedLow=Math.min(...rows.map(x=>Number(x[3])).filter(Number.isFinite))
          observedSince=Math.min(...rows.map(x=>Number(x[0])).filter(Number.isFinite))*1000
        }
      }
    }catch{}

    const timeline=[
      ...(pairCreatedAt?[{kind:'pair_created',at:pairCreatedAt,label:'PAIR CREATED',detail:new Date(pairCreatedAt).toISOString()}]:[]),
      {kind:'current_venue',at:Date.now(),label:'CURRENT VENUE',detail:String(pair.dexId||'unknown')},
      {kind:'current_liquidity',at:Date.now(),label:'CURRENT LIQUIDITY',detail:String(liquidityUsd)},
      ...(observedHigh!=null&&observedLow!=null?[{kind:'observed_range',at:Date.now(),label:'OBSERVED DAILY RANGE',detail:JSON.stringify({high:observedHigh,low:observedLow,since:observedSince})}]:[]),
    ]

    return NextResponse.json({
      live:true,asOf:Date.now(),source:['dexscreener','solana-mainnet-rpc',...(observedHigh!=null?['geckoterminal-ohlcv']:[])],
      token:{mint,symbol:pair.baseToken?.symbol||null,name:pair.baseToken?.name||null,priceUsd,marketCap,liquidityUsd,pairAddress:pair.pairAddress||null,dexId:pair.dexId||null,pairCreatedAt:pairCreatedAt||null,ageSeconds,stage:stage(ageSeconds)},
      authority:{mintAuthority:mintInfo?.mintAuthority||null,freezeAuthority:mintInfo?.freezeAuthority||null,mintRevoked:mintInfo?mintInfo.mintAuthority==null:null,freezeRevoked:mintInfo?mintInfo.freezeAuthority==null:null},
      distribution:{top10Pct,top20Pct,holders},
      range:{observedHigh,observedLow,observedSince,drawdownFromObservedHighPct:observedHigh&&priceUsd>0?(priceUsd/observedHigh-1)*100:null},
      timeline,
      warning:'Holder bubbles are based on the 20 largest token accounts returned by Solana RPC. This does not prove common ownership between wallets.'
    },{headers:{'Cache-Control':'public, s-maxage=20, stale-while-revalidate=60'}})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Token intelligence unavailable'},{status:502})
  }
}
