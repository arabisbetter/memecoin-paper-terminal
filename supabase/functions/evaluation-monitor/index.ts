import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

type Pair={
  chainId?:string
  pairAddress?:string
  priceUsd?:string
  marketCap?:number
  fdv?:number
  liquidity?:{usd?:number}
}
type Mark={mint:string;priceUsd:number;liquidityUsd:number;marketCapUsd:number;source:string}

const finite=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback}
const chunks=<T,>(items:T[],size:number)=>Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size))
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})

async function heartbeat(admin:any,component:string,status:'healthy'|'degraded'|'failed'|'unknown',startedMs:number,details:Record<string,unknown>={},error?:string){
  const now=new Date().toISOString()
  const {data:current}=await admin.from('paper_operational_heartbeats').select('consecutive_failures').eq('component',component).maybeSingle()
  await admin.from('paper_operational_heartbeats').upsert({
    component,status,
    last_started_at:new Date(startedMs).toISOString(),
    last_success_at:status==='healthy'||status==='degraded'?now:undefined,
    last_failure_at:status==='failed'?now:undefined,
    consecutive_failures:status==='failed'?Number(current?.consecutive_failures||0)+1:0,
    latency_ms:Math.max(0,Date.now()-startedMs),
    details:error?{...details,error:String(error).slice(0,500)}:details,
    updated_at:now,
  },{onConflict:'component'})
}

function envKeys(){
  const url=Deno.env.get('SUPABASE_URL')
  const secrets=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
  const secret=secrets.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!secret)throw new Error('server auth configuration missing')
  return{url,secret}
}

async function fetchJson(url:string,init:RequestInit={},timeoutMs=8000){
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),timeoutMs)
  const started=Date.now()
  try{
    const r=await fetch(url,{...init,signal:controller.signal,headers:{Accept:'application/json',...(init.headers||{})}})
    if(!r.ok)throw new Error(`${new URL(url).hostname} ${r.status}`)
    return{body:await r.json(),latencyMs:Date.now()-started}
  }finally{clearTimeout(timer)}
}

async function upsertHealth(admin:any,provider:string,ok:boolean,latencyMs:number|null,error?:string,metadata:Record<string,unknown>={}){
  const {data:current}=await admin.from('paper_market_provider_health').select('consecutive_successes,consecutive_failures').eq('provider',provider).maybeSingle()
  const skipped=metadata?.skipped===true
  await admin.from('paper_market_provider_health').upsert({
    provider,
    status:ok?'LIVE':(skipped?'DEGRADED':Number(current?.consecutive_failures||0)>=1?'DOWN':'DEGRADED'),
    last_latency_ms:latencyMs,
    consecutive_successes:ok?Number(current?.consecutive_successes||0)+1:0,
    consecutive_failures:ok||skipped?0:Number(current?.consecutive_failures||0)+1,
    last_success_at:ok?new Date().toISOString():undefined,
    last_failure_at:ok?undefined:new Date().toISOString(),
    last_error:ok?null:String(error||'provider unavailable').slice(0,500),
    metadata,
    updated_at:new Date().toISOString(),
  },{onConflict:'provider'})
}

async function dexMarks(admin:any,mints:string[],marks:Map<string,Mark>){
  if(!mints.length)return
  let maxLatency=0,success=false,lastError=''
  for(const group of chunks(mints,30)){
    try{
      const {body,latencyMs}=await fetchJson(`https://api.dexscreener.com/tokens/v1/solana/${group.map(encodeURIComponent).join(',')}`)
      maxLatency=Math.max(maxLatency,latencyMs)
      const pairs=(Array.isArray(body)?body:[]) as Pair[]
      const best=new Map<string,Pair>()
      for(const p of pairs){
        if(p.chainId!=='solana')continue
        const mint=String((p as any)?.baseToken?.address||'')
        const price=finite(p.priceUsd),liq=finite(p.liquidity?.usd)
        if(!mint||price<=0)continue
        const prev=best.get(mint)
        if(!prev||liq>finite(prev.liquidity?.usd))best.set(mint,p)
      }
      for(const [mint,p] of best)marks.set(mint,{
        mint,priceUsd:finite(p.priceUsd),liquidityUsd:finite(p.liquidity?.usd),
        marketCapUsd:finite(p.marketCap??p.fdv),source:'dexscreener'
      })
      success=true
    }catch(e){lastError=e instanceof Error?e.message:String(e)}
  }
  await upsertHealth(admin,'dexscreener',success,maxLatency||null,lastError,{requested:mints.length,returned:[...marks.values()].filter(m=>m.source==='dexscreener').length})
}

async function jupiterFallback(admin:any,mints:string[],marks:Map<string,Mark>){
  const key=Deno.env.get('JUPITER_API_KEY')
  const missing=mints.filter(m=>!marks.has(m))
  if(!missing.length)return
  if(!key){
    await upsertHealth(admin,'jupiter_price_v3',false,null,'JUPITER_API_KEY not configured',{skipped:true})
    return
  }
  let success=false,maxLatency=0,lastError=''
  for(const group of chunks(missing,50)){
    try{
      const {body,latencyMs}=await fetchJson(
        `https://api.jup.ag/price/v3?ids=${group.map(encodeURIComponent).join(',')}`,
        {headers:{'x-api-key':key}}
      )
      maxLatency=Math.max(maxLatency,latencyMs)
      for(const mint of group){
        const row=(body as Record<string,any>)?.[mint]
        const price=finite(row?.usdPrice)
        if(price>0)marks.set(mint,{mint,priceUsd:price,liquidityUsd:0,marketCapUsd:0,source:'jupiter_price_v3'})
      }
      success=true
    }catch(e){lastError=e instanceof Error?e.message:String(e)}
  }
  await upsertHealth(admin,'jupiter_price_v3',success,maxLatency||null,lastError,{requested:missing.length})
}

async function geckoFallback(admin:any,mints:string[],marks:Map<string,Mark>){
  const missing=mints.filter(m=>!marks.has(m))
  if(!missing.length)return
  let successes=0,maxLatency=0,lastError=''
  for(const mint of missing.slice(0,30)){
    try{
      const {body,latencyMs}=await fetchJson(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${encodeURIComponent(mint)}/pools?page=1`)
      maxLatency=Math.max(maxLatency,latencyMs)
      const pools=Array.isArray((body as any)?.data)?(body as any).data:[]
      let chosen:any=null
      for(const pool of pools){
        const a=pool?.attributes||{}
        const price=finite(a.base_token_price_usd),liq=finite(a.reserve_in_usd)
        if(price>0&&(!chosen||liq>finite(chosen?.attributes?.reserve_in_usd)))chosen=pool
      }
      if(chosen){
        const a=chosen.attributes
        marks.set(mint,{mint,priceUsd:finite(a.base_token_price_usd),liquidityUsd:finite(a.reserve_in_usd),marketCapUsd:finite(a.market_cap_usd||a.fdv_usd),source:'geckoterminal'})
        successes++
      }
    }catch(e){lastError=e instanceof Error?e.message:String(e)}
  }
  await upsertHealth(admin,'geckoterminal',successes>0,maxLatency||null,lastError,{requested:missing.length,returned:successes})
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return reply({error:'method not allowed'},405)
  const startedMs=Date.now()
  let admin:any=null
  try{
    const {url,secret}=envKeys()
    admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const token=req.headers.get('x-paper-internal-token')||''
    const {data:valid,error:tokenError}=await admin.rpc('paper_verify_internal_token',{p_token:token})
    if(tokenError||valid!==true)return reply({error:'unauthorized'},401)

    const startedAt=new Date().toISOString()
    const {data:evaluations,error:evalError}=await admin.from('paper_evaluations')
      .select('id,user_id,status,expires_at,last_equity_usd,last_cash_usd,last_open_value_usd,last_mark_at')
      .eq('status','active').order('last_mark_at',{ascending:true,nullsFirst:true}).limit(250)
    if(evalError)throw new Error(evalError.message)

    const run={active_evaluations:evaluations?.length||0,marked_live:0,marked_degraded:0,passed:0,failed:0,expired:0}
    if(!evaluations?.length){
      await admin.from('paper_evaluation_monitor_runs').insert({...run,started_at:startedAt,completed_at:new Date().toISOString(),provider_summary:{idle:true}})
      await heartbeat(admin,'evaluation_monitor','healthy',startedMs,{idle:true,activeEvaluations:0})
      return reply({ok:true,...run})
    }

    const userIds=[...new Set(evaluations.map((e:any)=>String(e.user_id)))]
    const [{data:accounts,error:accountError},{data:positions,error:positionError}]=await Promise.all([
      admin.from('paper_accounts').select('user_id,cash_usd').in('user_id',userIds),
      admin.from('paper_positions').select('id,user_id,token_id,quantity_tokens').in('user_id',userIds).eq('status','open').eq('accounting_version','usd_v2').gt('quantity_tokens',0),
    ])
    if(accountError)throw new Error(accountError.message)
    if(positionError)throw new Error(positionError.message)

    const tokenIds=[...new Set((positions||[]).map((p:any)=>String(p.token_id)))]
    let tokens:any[]=[]
    if(tokenIds.length){
      const {data,error}=await admin.from('tokens').select('id,mint_address').in('id',tokenIds)
      if(error)throw new Error(error.message)
      tokens=data||[]
    }
    const mintByToken=new Map(tokens.map((t:any)=>[String(t.id),String(t.mint_address)]))
    const mints=[...new Set(tokens.map((t:any)=>String(t.mint_address)).filter(Boolean))]
    const marks=new Map<string,Mark>()

    await dexMarks(admin,mints,marks)
    await jupiterFallback(admin,mints,marks)
    await geckoFallback(admin,mints,marks)

    if(marks.size){
      await admin.from('paper_market_marks').upsert([...marks.values()].map(m=>({
        mint_address:m.mint,price_usd:m.priceUsd,liquidity_usd:m.liquidityUsd||null,
        market_cap_usd:m.marketCapUsd||null,source:m.source,data_status:'LIVE',
        source_at:new Date().toISOString(),observed_at:new Date().toISOString(),
        metadata:{monitor:true}
      })),{onConflict:'mint_address'})
    }

    const accountByUser=new Map((accounts||[]).map((a:any)=>[String(a.user_id),finite(a.cash_usd)]))
    const positionsByUser=new Map<string,any[]>()
    for(const p of positions||[]){
      const key=String((p as any).user_id),arr=positionsByUser.get(key)||[]
      arr.push(p);positionsByUser.set(key,arr)
    }

    const errors:Record<string,string>={}
    for(const e of evaluations as any[]){
      const uid=String(e.user_id),cash=accountByUser.get(uid)
      if(cash===undefined){errors[uid]='PAPER account missing';run.marked_degraded++;continue}
      const open=positionsByUser.get(uid)||[]
      let openValue=0,complete=true
      for(const p of open){
        const mint=mintByToken.get(String(p.token_id)),mark=mint?marks.get(mint):undefined
        if(!mint||!mark){complete=false;break}
        openValue+=finite(p.quantity_tokens)*mark.priceUsd
      }
      const status=complete?'LIVE':'UNAVAILABLE'
      const equity=complete?cash+openValue:finite(e.last_equity_usd)
      const markCash=complete?cash:finite(e.last_cash_usd)
      const markOpen=complete?openValue:finite(e.last_open_value_usd)
      const {data:result,error}=await admin.rpc('paper_record_evaluation_mark_v1',{
        p_user_id:uid,p_equity_usd:equity,p_cash_usd:markCash,p_open_value_usd:markOpen,
        p_source:complete?'evaluation_monitor_live_marks':'evaluation_monitor_missing_mark',
        p_data_status:status,
      })
      if(error){errors[uid]=error.message;run.marked_degraded++;continue}
      if(status==='LIVE')run.marked_live++;else run.marked_degraded++
      if(result?.status==='passed')run.passed++
      if(result?.status==='failed')run.failed++
      if(result?.status==='expired')run.expired++
    }

    const {data:health}=await admin.from('paper_market_provider_health').select('provider,status,last_latency_ms,updated_at')
    await admin.from('paper_evaluation_monitor_runs').insert({
      ...run,started_at:startedAt,completed_at:new Date().toISOString(),
      provider_summary:{providers:health||[],mark_count:marks.size,mint_count:mints.length},
      error_summary:errors,
    })

    // Part 3 installs this service-role RPC. Ignore it while Part 2 is deployed alone.
    try{await admin.rpc('paper_refresh_leaderboards_v2')}catch{}

    const errorCount=Object.keys(errors).length
    await heartbeat(admin,'evaluation_monitor',errorCount||run.marked_degraded?'degraded':'healthy',startedMs,{
      activeEvaluations:run.active_evaluations,markedLive:run.marked_live,markedDegraded:run.marked_degraded,
      passed:run.passed,failed:run.failed,expired:run.expired,marks:marks.size,mints:mints.length,errorCount
    })
    return reply({ok:true,...run,marks:marks.size,mints:mints.length,errors:errorCount})
  }catch(error){
    const message=error instanceof Error?error.message:'unknown monitor error'
    if(admin)try{await heartbeat(admin,'evaluation_monitor','failed',startedMs,{},message)}catch{}
    return reply({error:message},500)
  }
})
