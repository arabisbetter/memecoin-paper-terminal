import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-paper-internal-token'}})
const finite=(v:unknown,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f}
const valid=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/
type Sig={signature:string;err:unknown;blockTime:number|null}
type TokenAccount={account?:{data?:{parsed?:{info?:{mint?:string;tokenAmount?:{uiAmount?:number;uiAmountString?:string}}}}}}
type EnhancedTx={signature?:string;type?:string;timestamp?:number;tokenTransfers?:Array<{mint?:string;fromUserAccount?:string;toUserAccount?:string;tokenAmount?:number}>}
type Pair={chainId?:string;baseToken?:{address?:string;symbol?:string;name?:string};priceUsd?:string;liquidity?:{usd?:number};marketCap?:number;fdv?:number;info?:{imageUrl?:string}}

function keys(){
  const url=Deno.env.get('SUPABASE_URL')
  const pubs=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}')
  const secs=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
  const pub=pubs.default||Deno.env.get('SUPABASE_ANON_KEY')
  const secret=secs.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!pub||!secret)throw new Error('server auth configuration missing')
  return{url,pub,secret}
}
async function fetchJson(url:string,init:RequestInit={},timeout=9000){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout)
  try{const r=await fetch(url,{...init,signal:c.signal,headers:{Accept:'application/json',...(init.headers||{})}});if(!r.ok)throw new Error(new URL(url).hostname+' '+r.status);return await r.json()}finally{clearTimeout(t)}
}
async function rpc(endpoint:string,method:string,params:unknown[]){
  const b=await fetchJson(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})},11000)
  if((b as any)?.error)throw new Error((b as any).error?.message||method+' failed')
  return (b as any)?.result
}
async function priceHoldings(mints:string[]){
  const out=new Map<string,{price:number;liquidity:number;symbol:string|null}>()
  for(let i=0;i<mints.length;i+=30){
    const group=mints.slice(i,i+30)
    if(!group.length)continue
    try{
      const rows=await fetchJson('https://api.dexscreener.com/tokens/v1/solana/'+group.join(',')) as Pair[]
      for(const p of Array.isArray(rows)?rows:[]){
        const mint=String(p.baseToken?.address||''),price=finite(p.priceUsd),liq=finite(p.liquidity?.usd)
        if(!mint||price<=0)continue
        const cur=out.get(mint)
        if(!cur||liq>cur.liquidity)out.set(mint,{price,liquidity:liq,symbol:p.baseToken?.symbol||null})
      }
    }catch{}
  }
  return out
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return reply({ok:true})
  if(req.method!=='POST')return reply({error:'method not allowed'},405)
  try{
    const {url,pub,secret}=keys()
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const internal=req.headers.get('x-paper-internal-token')||''
    let subject=''
    if(internal){
      const {data:validInternal}=await admin.rpc('paper_verify_internal_token',{p_token:internal})
      if(validInternal!==true)return reply({error:'unauthorized'},401)
      subject='internal-monitor'
    }else{
      const auth=req.headers.get('Authorization')
      if(!auth?.startsWith('Bearer '))return reply({error:'PAPER account required'},401)
      const userClient=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
      const {data:{user},error:userError}=await userClient.auth.getUser()
      if(userError||!user)return reply({error:'invalid session'},401)
      subject=user.id
      const {data:rate}=await admin.rpc('paper_consume_server_rate_limit_v1',{p_scope:'smart-wallet-scan',p_subject:user.id,p_limit:30,p_window_seconds:60})
      if(rate?.allowed===false)return reply({error:'Too many wallet scans. Try again shortly.'},429)
    }
    const body=await req.json().catch(()=>({}))
    const address=String(body?.address||'').trim()
    if(!valid.test(address))return reply({error:'invalid Solana wallet'},400)

    const helius=Deno.env.get('HELIUS_API_KEY')
    const endpoint=helius?'https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(helius):'https://api.mainnet-beta.solana.com'
    const [balance,signatures,tokenAccounts]=await Promise.all([
      rpc(endpoint,'getBalance',[address,{commitment:'confirmed'}]),
      rpc(endpoint,'getSignaturesForAddress',[address,{limit:100,commitment:'confirmed'}]),
      rpc(endpoint,'getTokenAccountsByOwner',[address,{programId:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'},{encoding:'jsonParsed',commitment:'confirmed'}]),
    ])
    const sigs=((signatures||[]) as Sig[])
    const now=Math.floor(Date.now()/1000),cutoff=now-30*86400
    const recent30=sigs.filter(s=>Number(s.blockTime||0)>=cutoff)
    const success=sigs.filter(s=>!s.err).length
    const successPct=sigs.length?success/sigs.length*100:null
    const activeDays=new Set(recent30.filter(s=>s.blockTime).map(s=>new Date(Number(s.blockTime)*1000).toISOString().slice(0,10))).size
    const lastActivity=sigs.find(s=>s.blockTime)?.blockTime||null

    let swaps:EnhancedTx[]=[]
    if(helius){
      try{
        const rows=await fetchJson('https://api.helius.xyz/v0/addresses/'+encodeURIComponent(address)+'/transactions?api-key='+encodeURIComponent(helius)+'&limit=100&type=SWAP') as EnhancedTx[]
        swaps=Array.isArray(rows)?rows.filter(x=>String(x.type||'').toUpperCase()==='SWAP'):[]
      }catch{}
    }
    const unique=new Set<string>()
    for(const tx of swaps)for(const tr of tx.tokenTransfers||[])if(tr.mint)unique.add(String(tr.mint))

    const raw=((tokenAccounts?.value||[]) as TokenAccount[]).map(row=>{
      const i=row.account?.data?.parsed?.info,mint=String(i?.mint||''),amount=finite(i?.tokenAmount?.uiAmount??i?.tokenAmount?.uiAmountString)
      return{mint,amount}
    }).filter(x=>x.mint&&x.amount>0).sort((a,b)=>b.amount-a.amount).slice(0,60)
    const prices=await priceHoldings(raw.map(x=>x.mint))
    const priced=raw.map(h=>{const p=prices.get(h.mint);return{...h,price:p?.price||0,liquidity:p?.liquidity||0,symbol:p?.symbol||null,value:(p?.price||0)*h.amount}}).filter(h=>h.value>0)
    const portfolio=priced.reduce((s,h)=>s+h.value,0)
    const top=priced.sort((a,b)=>b.value-a.value)[0]
    const topPct=portfolio>0&&top?top.value/portfolio*100:null

    const swapCount30=swaps.filter(s=>Number(s.timestamp||0)>=cutoff).length
    const activity=Math.min(30,Math.round(swapCount30/40*30))
    const consistency=Math.min(25,Math.round(activeDays/15*25))
    const reliability=successPct==null?0:Math.max(0,Math.min(15,Math.round((successPct-85)/15*15)))
    const breadth=Math.min(15,Math.round(unique.size/15*15))
    const hoursSince=lastActivity?Math.max(0,(now-lastActivity)/3600):9999
    const recency=hoursSince<=1?15:hoursSince<=6?13:hoursSince<=24?10:hoursSince<=72?6:hoursSince<=168?3:0
    const smartScore=Math.max(0,Math.min(100,activity+consistency+reliability+breadth+recency))
    const sample=Math.max(sigs.length,swaps.length)
    const confidence=helius&&sample>=50?'HIGH':sample>=20?'MEDIUM':'LOW'
    const sources=['solana_rpc',...(helius?['helius_enhanced_transactions']:[]),...(priced.length?['dexscreener']:[])]
    const snapshot={
      address,smart_score:smartScore,confidence,recent_tx_count:sigs.length,tx_success_pct:successPct,
      swap_count_30d:helius?swapCount30:null,active_days_30d:activeDays,unique_tokens_30d:helius?unique.size:null,
      sol_balance:finite(balance?.value)/1e9,priced_portfolio_usd:portfolio,priced_holding_count:priced.length,top_holding_pct:topPct,
      last_activity_at:lastActivity?new Date(lastActivity*1000).toISOString():null,profitability_status:'UNKNOWN',
      estimated_realized_pnl_usd:null,estimated_win_rate_pct:null,sources,
      score_components:{activity,consistency,reliability,breadth,recency},
      details:{profitability_note:'No historical P&L is claimed without reconstructable cost basis.',helius_enrichment:Boolean(helius),sampled_signatures:sigs.length,sampled_swaps:swaps.length,top_priced_holdings:priced.slice(0,8)},
      observed_at:new Date().toISOString(),updated_at:new Date().toISOString()
    }
    const {error}=await admin.from('paper_smart_wallet_snapshots').upsert(snapshot,{onConflict:'address'})
    if(error)throw new Error(error.message)
    return reply({ok:true,dataStatus:helius?'LIVE':'DEGRADED',wallet:snapshot})
  }catch(error){return reply({error:error instanceof Error?error.message:'wallet intelligence scan failed'},500)}
})