import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

type RpcResult<T>={result?:T;error?:{message?:string}}
type Largest={address:string;amount:string;uiAmount?:number|null;uiAmountString?:string}
type Pair={chainId?:string;dexId?:string;pairAddress?:string;priceUsd?:string;marketCap?:number;fdv?:number;liquidity?:{usd?:number};pairCreatedAt?:number;baseToken?:{address?:string;symbol?:string;name?:string}}
type Gecko={data?:{attributes?:{ohlcv_list?:Array<[number,number,number,number,number,number]>}}}

const valid=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type',
  'Cache-Control':'public, max-age=15, s-maxage=30, stale-while-revalidate=60'
}})
const finite=(v:unknown,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f}
function pct(raw:bigint,total:bigint){return total>BigInt(0)?Number(raw*BigInt(1000000)/total)/10000:0}
function stage(ageSeconds:number){return ageSeconds<900?'LAUNCH':ageSeconds<21600?'EARLY':ageSeconds<86400?'DAY ONE':ageSeconds<604800?'FIRST WEEK':'ESTABLISHED'}

function keys(){
  const url=Deno.env.get('SUPABASE_URL')
  const secrets=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
  const secret=secrets.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!secret)throw new Error('server configuration missing')
  return{url,secret}
}
async function fetchJson(url:string,init:RequestInit={},timeout=9000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout)
  try{
    const r=await fetch(url,{...init,signal:c.signal,headers:{Accept:'application/json',...(init.headers||{})}})
    if(!r.ok)throw new Error(new URL(url).hostname+' '+r.status)
    return await r.json()
  }finally{clearTimeout(t)}
}
async function rpc(endpoint:string,method:string,params:unknown[]){
  const body=await fetchJson(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})},11000) as RpcResult<any>
  if(body.error)throw new Error(body.error.message||method+' failed')
  if(body.result===undefined)throw new Error(method+' returned no result')
  return body.result
}
async function rpcFallback(endpoints:{url:string;name:string}[],method:string,params:unknown[]){
  let last:unknown=null
  for(const endpoint of endpoints){
    try{return{result:await rpc(endpoint.url,method,params),provider:endpoint.name}}catch(error){last=error}
  }
  throw last instanceof Error?last:new Error(method+' failed across RPC providers')
}
async function bestPair(mint:string){
  const rows=await fetchJson('https://api.dexscreener.com/token-pairs/v1/solana/'+encodeURIComponent(mint)) as Pair[]
  const validRows=(Array.isArray(rows)?rows:[]).filter(p=>p.chainId==='solana'&&String(p.baseToken?.address||'')===mint&&finite(p.priceUsd)>0)
  validRows.sort((a,b)=>finite(b.liquidity?.usd)-finite(a.liquidity?.usd))
  if(!validRows.length)throw new Error('No active Solana market found')
  return validRows[0]
}
function clientSubject(req:Request){
  const raw=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||req.headers.get('x-real-ip')||'unknown'
  return raw.split(',')[0].trim().slice(0,96)||'unknown'
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return reply({ok:true})
  if(req.method!=='GET'&&req.method!=='POST')return reply({error:'method not allowed'},405)
  try{
    const {url,secret}=keys()
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const subject=clientSubject(req)
    const {data:rate}=await admin.rpc('paper_consume_server_rate_limit_v1',{p_scope:'public-token-intel',p_subject:subject,p_limit:30,p_window_seconds:60})
    if(rate?.allowed===false)return reply({error:'Too many token intelligence requests. Try again shortly.'},429)

    let mint=''
    if(req.method==='GET')mint=new URL(req.url).searchParams.get('mint')||''
    else mint=String((await req.json().catch(()=>({})))?.mint||'')
    mint=mint.trim()
    if(!valid.test(mint))return reply({error:'invalid Solana mint'},400)

    const pair=await bestPair(mint)
    const helius=Deno.env.get('HELIUS_API_KEY')
    const endpoints=[
      ...(helius?[{url:'https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(helius),name:'helius'}]:[]),
      {url:'https://solana-rpc.publicnode.com',name:'publicnode'},
      {url:'https://rpc.ankr.com/solana',name:'ankr'},
      {url:'https://api.mainnet.solana.com',name:'solana-official'},
    ]
    const [mintCall,largestCall]=await Promise.all([
      rpcFallback(endpoints,'getAccountInfo',[mint,{encoding:'jsonParsed',commitment:'confirmed'}]),
      rpcFallback(endpoints,'getTokenLargestAccounts',[mint,{commitment:'confirmed'}]),
    ])
    const mintInfo=mintCall.result?.value?.data?.parsed?.info||null
    const largest=(largestCall.result?.value||[]).slice(0,20) as Largest[]
    const accounts=largest.map(x=>x.address).filter(Boolean)
    let ownerValues:any[]=[]
    let ownerProvider:string|null=null
    if(accounts.length){
      const owners=await rpcFallback(endpoints,'getMultipleAccounts',[accounts,{encoding:'jsonParsed',commitment:'confirmed'}])
      ownerValues=owners.result?.value||[]
      ownerProvider=owners.provider
    }
    const supplyRaw=BigInt(String(mintInfo?.supply||'0'))
    const holders=largest.map((row,i)=>{
      let raw=BigInt(0);try{raw=BigInt(String(row.amount||'0'))}catch{}
      const owner=String(ownerValues?.[i]?.data?.parsed?.info?.owner||'')
      return{rank:i+1,tokenAccount:row.address,owner:owner||null,amountUi:finite(row.uiAmount??row.uiAmountString),pct:pct(raw,supplyRaw)}
    })
    const top10Pct=holders.slice(0,10).reduce((s,h)=>s+h.pct,0)
    const top20Pct=holders.reduce((s,h)=>s+h.pct,0)
    const priceUsd=finite(pair.priceUsd),marketCap=finite(pair.marketCap??pair.fdv),liquidityUsd=finite(pair.liquidity?.usd)
    const pairCreatedAt=finite(pair.pairCreatedAt),ageSeconds=pairCreatedAt?Math.max(0,Math.round((Date.now()-pairCreatedAt)/1000)):0

    let observedHigh:number|null=null,observedLow:number|null=null,observedSince:number|null=null
    try{
      const r=await fetchJson('https://api.geckoterminal.com/api/v2/networks/solana/pools/'+encodeURIComponent(String(pair.pairAddress||''))+'/ohlcv/day?aggregate=1&limit=300&currency=usd&token=base&include_empty_intervals=false',{},8000) as Gecko
      const rows=r.data?.attributes?.ohlcv_list||[]
      if(rows.length){
        const highs=rows.map(x=>Number(x[2])).filter(Number.isFinite),lows=rows.map(x=>Number(x[3])).filter(Number.isFinite),times=rows.map(x=>Number(x[0])).filter(Number.isFinite)
        if(highs.length)observedHigh=Math.max(...highs)
        if(lows.length)observedLow=Math.min(...lows)
        if(times.length)observedSince=Math.min(...times)*1000
      }
    }catch{}

    const rpcProviders=[mintCall.provider,largestCall.provider,...(ownerProvider?[ownerProvider]:[])]
    const sources=[...new Set(['dexscreener',...rpcProviders.map(x=>x==='helius'?'helius-rpc':'solana-mainnet-rpc'),...(observedHigh!=null?['geckoterminal-ohlcv']:[])])]
    return reply({
      live:true,dataStatus:helius?'LIVE':'DEGRADED',asOf:Date.now(),source:sources,
      token:{mint,symbol:pair.baseToken?.symbol||null,name:pair.baseToken?.name||null,priceUsd,marketCap,liquidityUsd,pairAddress:pair.pairAddress||null,dexId:pair.dexId||null,pairCreatedAt:pairCreatedAt||null,ageSeconds,stage:stage(ageSeconds)},
      authority:{mintAuthority:mintInfo?.mintAuthority||null,freezeAuthority:mintInfo?.freezeAuthority||null,mintRevoked:mintInfo?mintInfo.mintAuthority==null:null,freezeRevoked:mintInfo?mintInfo.freezeAuthority==null:null},
      distribution:{top10Pct,top20Pct,holders},
      range:{observedHigh,observedLow,observedSince,drawdownFromObservedHighPct:observedHigh&&priceUsd>0?(priceUsd/observedHigh-1)*100:null},
      timeline:[
        ...(pairCreatedAt?[{kind:'pair_created',at:pairCreatedAt,label:'PAIR CREATED',detail:new Date(pairCreatedAt).toISOString()}]:[]),
        {kind:'current_venue',at:Date.now(),label:'CURRENT VENUE',detail:String(pair.dexId||'unknown')},
        {kind:'current_liquidity',at:Date.now(),label:'CURRENT LIQUIDITY',detail:String(liquidityUsd)},
        ...(observedHigh!=null&&observedLow!=null?[{kind:'observed_range',at:Date.now(),label:'OBSERVED DAILY RANGE',detail:JSON.stringify({high:observedHigh,low:observedLow,since:observedSince})}]:[]),
      ],
      warning:'Holder bubbles use the 20 largest token accounts returned by live Solana RPC. Concentration does not prove common ownership.'
    })
  }catch(error){
    return reply({error:error instanceof Error?error.message:'token intelligence unavailable'},502)
  }
})
