import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

type DexPair={
  chainId?:string
  dexId?:string
  pairAddress?:string
  baseToken?:{address?:string;symbol?:string;name?:string}
  priceUsd?:string
  marketCap?:number
  fdv?:number
  liquidity?:{usd?:number}
  pairCreatedAt?:number
  txns?:{m5?:{buys?:number;sells?:number}}
}
type HolderRow={owner?:string;amount?:string;balance?:string}

const finite=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback}
const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)))
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-paper-internal-token'}
})
const isMint=(s:string)=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)

function envKeys(){
  const url=Deno.env.get('SUPABASE_URL')
  const pubKeys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}')
  const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
  const pub=pubKeys.default||Deno.env.get('SUPABASE_ANON_KEY')
  const secret=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!pub||!secret)throw new Error('server auth configuration missing')
  return{url,pub,secret}
}
async function fetchJson(url:string,init:RequestInit={},timeoutMs=9000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs),started=Date.now()
  try{
    const r=await fetch(url,{...init,signal:controller.signal,headers:{Accept:'application/json',...(init.headers||{})}})
    if(!r.ok)throw new Error(`${new URL(url).hostname} ${r.status}`)
    return{body:await r.json(),latencyMs:Date.now()-started}
  }finally{clearTimeout(timer)}
}
async function rpc(endpoint:string,method:string,params:unknown[]){
  const {body,latencyMs}=await fetchJson(endpoint,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})
  },11000)
  if((body as any)?.error)throw new Error((body as any).error?.message||`${method} failed`)
  return{result:(body as any)?.result,latencyMs}
}
async function health(admin:any,provider:string,ok:boolean,latencyMs:number|null,error?:string,metadata:Record<string,unknown>={}){
  const {data:cur}=await admin.from('paper_market_provider_health').select('consecutive_successes,consecutive_failures').eq('provider',provider).maybeSingle()
  await admin.from('paper_market_provider_health').upsert({
    provider,status:ok?'LIVE':(Number(cur?.consecutive_failures||0)>=1?'DOWN':'DEGRADED'),
    last_latency_ms:latencyMs,consecutive_successes:ok?Number(cur?.consecutive_successes||0)+1:0,
    consecutive_failures:ok?0:Number(cur?.consecutive_failures||0)+1,
    last_success_at:ok?new Date().toISOString():undefined,last_failure_at:ok?undefined:new Date().toISOString(),
    last_error:ok?null:String(error||'provider unavailable').slice(0,500),metadata,updated_at:new Date().toISOString()
  },{onConflict:'provider'})
}

async function authorize(req:Request,admin:any,url:string,pub:string){
  const internal=req.headers.get('x-paper-internal-token')||''
  if(internal){
    const {data}=await admin.rpc('paper_verify_internal_token',{p_token:internal})
    if(data===true)return{internal:true,user:null}
  }
  const auth=req.headers.get('Authorization')
  if(!auth?.startsWith('Bearer '))throw new Error('AUTH_REQUIRED')
  const client=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await client.auth.getUser()
  if(error||!user)throw new Error('AUTH_REQUIRED')
  return{internal:false,user}
}

async function bestDexPair(mint:string){
  const {body,latencyMs}=await fetchJson(`https://api.dexscreener.com/token-pairs/v1/solana/${encodeURIComponent(mint)}`)
  const pairs=(Array.isArray(body)?body:[]) as DexPair[]
  const valid=pairs.filter(p=>p.chainId==='solana'&&String(p.baseToken?.address||'')===mint&&finite(p.priceUsd)>0)
  valid.sort((a,b)=>finite(b.liquidity?.usd)-finite(a.liquidity?.usd))
  if(!valid.length)throw new Error('No active Solana market found')
  return{pair:valid[0],latencyMs}
}
function pctRaw(raw:bigint,total:bigint){
  if(total<=0n)return 0
  return Number(raw*1000000n/total)/10000
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-paper-internal-token'}})
  if(req.method!=='POST')return reply({error:'method not allowed'},405)
  try{
    const {url,pub,secret}=envKeys()
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    await authorize(req,admin,url,pub)
    const {data:control}=await admin.from('paper_control_plane').select('risk_engine_enabled').eq('id',true).maybeSingle()
    if(control?.risk_engine_enabled===false)return reply({error:'Risk engine is temporarily disabled.',code:'RISK_ENGINE_PAUSED'},503)
    const body=await req.json().catch(()=>({}))
    const mint=String(body?.mint||'').trim()
    if(!isMint(mint))return reply({error:'invalid Solana mint'},400)

    const sources:string[]=[]
    let pair:DexPair|undefined,dexLatency=0
    try{
      const dex=await bestDexPair(mint);pair=dex.pair;dexLatency=dex.latencyMs;sources.push('dexscreener')
      await health(admin,'dexscreener',true,dexLatency)
    }catch(e){
      await health(admin,'dexscreener',false,null,e instanceof Error?e.message:String(e))
      return reply({error:e instanceof Error?e.message:'market unavailable',dataStatus:'UNAVAILABLE'},503)
    }

    const heliusKey=Deno.env.get('HELIUS_API_KEY')
    const endpoint=heliusKey
      ?`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}`
      :'https://api.mainnet-beta.solana.com'
    const chainProvider=heliusKey?'helius':'solana_public_rpc'
    let chainLatency=0
    let mintInfo:any=null,largest:any[]=[]
    const ownerByAccount=new Map<string,string>()
    let holderCount:number|null=null,holderLowerBound=false,asset:any=null,devSellDetected:boolean|null=null
    const devWallets=new Set<string>()

    try{
      const [mintRes,largestRes]=await Promise.all([
        rpc(endpoint,'getAccountInfo',[mint,{encoding:'jsonParsed',commitment:'confirmed'}]),
        rpc(endpoint,'getTokenLargestAccounts',[mint,{commitment:'confirmed'}])
      ])
      chainLatency=Math.max(mintRes.latencyMs,largestRes.latencyMs)
      mintInfo=mintRes.result?.value?.data?.parsed?.info||null
      largest=Array.isArray(largestRes.result?.value)?largestRes.result.value.slice(0,20):[]
      const tokenAccounts=largest.map((x:any)=>String(x.address||'')).filter(Boolean)
      if(tokenAccounts.length){
        const ownersRes=await rpc(endpoint,'getMultipleAccounts',[tokenAccounts,{encoding:'jsonParsed',commitment:'confirmed'}])
        chainLatency=Math.max(chainLatency,ownersRes.latencyMs)
        ;(ownersRes.result?.value||[]).forEach((row:any,i:number)=>{
          const owner=row?.data?.parsed?.info?.owner
          if(owner)ownerByAccount.set(tokenAccounts[i],String(owner))
        })
      }
      if(mintInfo?.mintAuthority)devWallets.add(String(mintInfo.mintAuthority))
      sources.push(chainProvider)
      await health(admin,chainProvider,true,chainLatency)
    }catch(e){
      await health(admin,chainProvider,false,chainLatency||null,e instanceof Error?e.message:String(e))
    }

    if(heliusKey){
      try{
        const assetRes=await rpc(endpoint,'getAsset',[{id:mint}])
        asset=assetRes.result
        chainLatency=Math.max(chainLatency,assetRes.latencyMs)
        for(const a of asset?.authorities||[])if(a?.address)devWallets.add(String(a.address))
        for(const c of asset?.creators||asset?.content?.metadata?.creators||[])if(c?.address)devWallets.add(String(c.address))
      }catch{/* optional DAS enrichment */}

      try{
        const owners=new Set<string>()
        let exact=false,totalAccounts=0
        for(let page=1;page<=10;page++){
          const pageRes=await rpc(endpoint,'getTokenAccounts',[{mint,limit:1000,page}])
          const rows=(pageRes.result?.token_accounts||pageRes.result?.tokenAccounts||[]) as HolderRow[]
          totalAccounts+=rows.length
          for(const row of rows)if(row.owner)owners.add(String(row.owner))
          if(rows.length<1000){exact=true;break}
        }
        holderCount=owners.size
        holderLowerBound=!exact
        sources.push('helius_token_accounts')
      }catch{/* holder count stays unknown */}

      if(devWallets.size){
        try{
          let checked=false,sold=false
          for(const wallet of [...devWallets].slice(0,3)){
            const {body:txs}=await fetchJson(`https://api.helius.xyz/v0/addresses/${encodeURIComponent(wallet)}/transactions?api-key=${encodeURIComponent(heliusKey)}&limit=20&type=SWAP`)
            if(Array.isArray(txs)){
              checked=true
              for(const tx of txs){
                const transfers=Array.isArray((tx as any)?.tokenTransfers)?(tx as any).tokenTransfers:[]
                if(transfers.some((t:any)=>String(t?.mint)===mint&&String(t?.fromUserAccount)===wallet&&finite(t?.tokenAmount)>0)){sold=true;break}
              }
            }
            if(sold)break
          }
          devSellDetected=checked?sold:null
          if(checked)sources.push('helius_parsed_transactions')
        }catch{/* unknown, never fabricate false */}
      }
    }

    const supplyRaw=BigInt(String(mintInfo?.supply||'0'))
    const amounts=largest.map((x:any)=>{
      try{return BigInt(String(x?.amount||'0'))}catch{return 0n}
    })
    const top10Raw=amounts.slice(0,10).reduce((a,b)=>a+b,0n)
    const top20Raw=amounts.slice(0,20).reduce((a,b)=>a+b,0n)
    const top10=supplyRaw>0n?pctRaw(top10Raw,supplyRaw):null
    const top20=supplyRaw>0n?pctRaw(top20Raw,supplyRaw):null

    let devRaw=0n
    for(let i=0;i<largest.length;i++){
      const owner=ownerByAccount.get(String(largest[i]?.address||''))
      if(owner&&devWallets.has(owner))devRaw+=amounts[i]||0n
    }
    const devPct=supplyRaw>0n&&devWallets.size?pctRaw(devRaw,supplyRaw):null

    const liquidity=finite(pair?.liquidity?.usd)
    const ageSeconds=pair?.pairCreatedAt?Math.max(0,Math.round((Date.now()-Number(pair.pairCreatedAt))/1000)):null
    const m5Buys=finite(pair?.txns?.m5?.buys),m5Sells=finite(pair?.txns?.m5?.sells),m5Tx=m5Buys+m5Sells
    const mintAuthorityPresent=Boolean(mintInfo?.mintAuthority)
    const freezeAuthorityPresent=Boolean(mintInfo?.freezeAuthority)

    // These three fields are heuristics, not claims that specific wallets coordinated.
    const bundledScore=clamp((top10==null?0:Math.max(0,top10-35)*1.4)+(ageSeconds!=null&&ageSeconds<3600?15:0))
    const sniperScore=clamp((ageSeconds!=null&&ageSeconds<1800?25:0)+Math.min(45,m5Tx*1.5)+(top10!=null&&top10>50?20:0))
    const clusterScore=clamp((top10==null?0:Math.max(0,top10-40))+(devPct==null?0:devPct*1.5)+(top20!=null&&top10!=null?Math.max(0,(top20-top10)-20):0))

    let riskScore=0
    if(freezeAuthorityPresent)riskScore+=35
    if(mintAuthorityPresent)riskScore+=10
    if(top10!=null)riskScore+=top10>=65?25:top10>=50?15:top10>=35?7:0
    if(devPct!=null)riskScore+=devPct>=15?25:devPct>=5?10:0
    riskScore+=liquidity<10000?25:liquidity<25000?10:0
    if(ageSeconds!=null&&ageSeconds<900)riskScore+=10
    if(devSellDetected===true)riskScore+=30
    riskScore+=Math.round(bundledScore/12)+Math.round(sniperScore/12)
    riskScore=clamp(riskScore)

    const {data:policy}=await admin.from('paper_risk_policy').select('*').eq('id',true).single()
    const blocked=
      riskScore>=finite(policy?.max_risk_score,80)||
      (Boolean(policy?.block_freeze_authority)&&freezeAuthorityPresent)||
      (Boolean(policy?.block_mint_authority)&&mintAuthorityPresent)||
      liquidity<finite(policy?.min_liquidity_usd,10000)||
      (top10!=null&&top10>finite(policy?.max_top10_holder_pct,65))||
      (devPct!=null&&devPct>finite(policy?.max_dev_holder_pct,15))

    const riskLevel=riskScore>=80?'CRITICAL':riskScore>=60?'HIGH':riskScore>=30?'MEDIUM':'LOW'
    const dataStatus=mintInfo&&largest.length?(heliusKey?'LIVE':'DEGRADED'):'DEGRADED'
    const snapshot={
      mint_address:mint,token_symbol:String(pair?.baseToken?.symbol||'')||null,
      top10_holder_pct:top10,top20_holder_pct:top20,dev_holder_pct:devPct,
      liquidity_usd:liquidity,mint_authority_present:mintInfo?mintAuthorityPresent:null,
      freeze_authority_present:mintInfo?freezeAuthorityPresent:null,
      holder_count:holderCount,holder_count_is_lower_bound:holderLowerBound,
      dev_sell_detected:devSellDetected,bundled_wallet_score:bundledScore,sniper_score:sniperScore,
      suspicious_cluster_score:clusterScore,token_age_seconds:ageSeconds,
      risk_score:riskScore,risk_level:riskLevel,funded_buy_blocked:blocked,
      data_status:dataStatus,sources:[...new Set(sources)],observed_at:new Date().toISOString(),
      details:{
        heuristic_fields:['bundled_wallet_score','sniper_score','suspicious_cluster_score'],
        heuristic_warning:'Heuristic signals indicate patterns for review; they do not prove coordinated behavior.',
        dev_wallet_candidates:[...devWallets].slice(0,10),
        dev_holding_scope:devWallets.size?(holderLowerBound?'computed from observed accounts/largest holders where available':'observed holder data'):'creator/authority unavailable',
        holder_count_note:holderCount==null?'unavailable':holderLowerBound?'lower bound; scan capped at 10,000 token accounts':'exact within scanned token accounts',
        dex_id:pair?.dexId||null,pair_address:pair?.pairAddress||null,
        price_usd:finite(pair?.priceUsd),market_cap_usd:finite(pair?.marketCap??pair?.fdv),
        five_minute_transactions:m5Tx
      }
    }
    const {error:saveError}=await admin.from('paper_token_risk_snapshots').upsert(snapshot,{onConflict:'mint_address'})
    if(saveError)throw new Error(saveError.message)
    await admin.from('paper_market_marks').upsert({
      mint_address:mint,price_usd:finite(pair?.priceUsd),liquidity_usd:liquidity,
      market_cap_usd:finite(pair?.marketCap??pair?.fdv),source:'dexscreener',
      data_status:'LIVE',source_at:new Date().toISOString(),observed_at:new Date().toISOString(),
      metadata:{risk_scan:true,dex_id:pair?.dexId||null,pair_address:pair?.pairAddress||null}
    },{onConflict:'mint_address'})

    return reply({
      ok:true,paperSimulationAllowed:true,fundedBuyBlocked:blocked,dataStatus,
      risk:{score:riskScore,level:riskLevel,top10HolderPct:top10,top20HolderPct:top20,devHolderPct:devPct,
        liquidityUsd:liquidity,mintAuthorityPresent:mintInfo?mintAuthorityPresent:null,
        freezeAuthorityPresent:mintInfo?freezeAuthorityPresent:null,holderCount,
        holderCountIsLowerBound:holderLowerBound,devSellDetected,
        bundledWalletScore:bundledScore,sniperScore,suspiciousClusterScore:clusterScore,
        tokenAgeSeconds:ageSeconds},
      policy:{minLiquidityUsd:finite(policy?.min_liquidity_usd,10000),maxTop10HolderPct:finite(policy?.max_top10_holder_pct,65),
        maxDevHolderPct:finite(policy?.max_dev_holder_pct,15),blockFreezeAuthority:Boolean(policy?.block_freeze_authority),
        blockMintAuthority:Boolean(policy?.block_mint_authority),maxRiskScore:finite(policy?.max_risk_score,80)},
      sources:[...new Set(sources)],
      heuristicWarning:'Bundle, sniper, and cluster scores are heuristics for review and are not proof of coordinated behavior.'
    })
  }catch(error){
    const message=error instanceof Error?error.message:'unknown risk scan error'
    return reply({error:message==='AUTH_REQUIRED'?'authentication required':message},message==='AUTH_REQUIRED'?401:500)
  }
})
