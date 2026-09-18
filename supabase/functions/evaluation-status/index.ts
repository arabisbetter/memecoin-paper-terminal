import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
}
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})
const finite=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback}
type Pair={chainId?:string;pairAddress?:string;priceUsd?:string;liquidity?:{usd?:number}}

async function fetchJson(url:string,timeoutMs=6500){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs)
  try{const r=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});if(!r.ok)throw new Error(`market data unavailable (${r.status})`);return await r.json()}finally{clearTimeout(timer)}
}
async function bestPair(mint:string):Promise<Pair>{
  const body=await fetchJson(`https://api.dexscreener.com/token-pairs/v1/solana/${encodeURIComponent(mint)}`)
  const pairs=(Array.isArray(body)?body:[]) as Pair[]
  const valid=pairs.filter(p=>p.chainId==='solana'&&finite(p.priceUsd)>0)
  if(!valid.length)throw new Error(`No live Solana market for ${mint}`)
  valid.sort((a,b)=>finite(b.liquidity?.usd)-finite(a.liquidity?.usd))
  return valid[0]
}

async function authoritativeEquity(admin:any,userId:string){
  const [{data:account,error:accountError},{data:positions,error:positionError}]=await Promise.all([
    admin.from('paper_accounts').select('cash_usd').eq('user_id',userId).maybeSingle(),
    admin.from('paper_positions').select('id,token_id,quantity_tokens').eq('user_id',userId).eq('status','open').eq('accounting_version','usd_v2').gt('quantity_tokens',0),
  ])
  if(accountError)throw new Error(accountError.message)
  if(positionError)throw new Error(positionError.message)
  if(!account)throw new Error('PAPER account not found')
  const open=(positions||[]) as {id:string;token_id:string;quantity_tokens:number}[]
  if(!open.length)return {cashUsd:finite(account.cash_usd),openValueUsd:0,equityUsd:finite(account.cash_usd),positions:[],source:'server_cash',dataStatus:'LIVE'}

  const ids=[...new Set(open.map(p=>p.token_id))]
  const {data:tokens,error:tokenError}=await admin.from('tokens').select('id,mint_address').in('id',ids)
  if(tokenError)throw new Error(tokenError.message)
  const mintById=new Map<string,string>((tokens||[]).map((t:any)=>[String(t.id),String(t.mint_address)] as [string,string]))
  if(mintById.size!==ids.length)throw new Error('Evaluation mark unavailable: token metadata missing')

  const marks=await Promise.all(open.map(async p=>{
    const mint=mintById.get(String(p.token_id));if(!mint)throw new Error('Evaluation mark unavailable: token mint missing')
    const started=Date.now();const pair=await bestPair(mint);const ageMs=Date.now()-started
    if(ageMs>10_000)throw new Error('Evaluation mark unavailable: stale market data')
    return {positionId:p.id,mint,quantityTokens:finite(p.quantity_tokens),priceUsd:finite(pair.priceUsd),valueUsd:finite(p.quantity_tokens)*finite(pair.priceUsd),pairAddress:pair.pairAddress||null}
  }))
  const cashUsd=finite(account.cash_usd),openValueUsd=marks.reduce((s,p)=>s+p.valueUsd,0)
  return {cashUsd,openValueUsd,equityUsd:cashUsd+openValueUsd,positions:marks,source:'dexscreener_live_marks',dataStatus:'LIVE'}
}

async function markActiveEvaluation(admin:any,userId:string){
  const {data:active,error}=await admin.from('paper_evaluations').select('id,status').eq('user_id',userId).eq('status','active').order('starts_at',{ascending:false}).limit(1).maybeSingle()
  if(error)throw new Error(error.message)
  if(!active)return null
  try{
    const equity=await authoritativeEquity(admin,userId)
    const {data,error:markError}=await admin.rpc('paper_record_evaluation_mark_v1',{
      p_user_id:userId,
      p_equity_usd:equity.equityUsd,
      p_cash_usd:equity.cashUsd,
      p_open_value_usd:equity.openValueUsd,
      p_source:equity.source,
      p_data_status:equity.dataStatus,
    })
    if(markError)throw new Error(markError.message)
    return {...data,positions:equity.positions}
  }catch(error){
    const message=error instanceof Error?error.message:'Live evaluation mark unavailable'
    await admin.from('paper_evaluations').update({data_status:'UNAVAILABLE',last_mark_source:'mark_failed',updated_at:new Date().toISOString()}).eq('id',active.id)
    return {active:true,id:active.id,status:'active',data_status:'UNAVAILABLE',mark_error:message}
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(req.method!=='POST')return reply({error:'method not allowed'},405)
  try{
    const authHeader=req.headers.get('Authorization')
    if(!authHeader?.startsWith('Bearer '))return reply({error:'PAPER account required'},401)
    const keys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}')
    const secrets=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
    const url=Deno.env.get('SUPABASE_URL'),pub=keys.default||Deno.env.get('SUPABASE_ANON_KEY'),secret=secrets.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if(!url||!pub||!secret)throw new Error('server auth configuration missing')
    const userClient=createClient(url,pub,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}})
    const {data:{user},error:userError}=await userClient.auth.getUser()
    if(userError||!user)return reply({error:'invalid session'},401)
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const body=await req.json().catch(()=>({})),action=String(body?.action||'status')

    if(action==='start'){
      const {data:control}=await admin.from('paper_control_plane').select('emergency_pause,evaluation_entries_enabled,maintenance_message').eq('id',true).maybeSingle()
      if(control?.emergency_pause||control?.evaluation_entries_enabled===false)return reply({error:control?.maintenance_message||'New evaluations are temporarily paused.',code:'PLATFORM_PAUSED'},503)
      const {data,error}=await userClient.rpc('paper_start_evaluation_v1')
      if(error){
        const message=error.message||'Could not start evaluation'
        const status=/RECOVERABLE_LOGIN_REQUIRED|LEGAL_ACCEPTANCE_REQUIRED/.test(message)?403:/COOLDOWN/.test(message)?409:400
        return reply({error:message},status)
      }
      const marked=await markActiveEvaluation(admin,user.id)
      return reply({ok:true,started:data,evaluation:marked||data,anonymous:Boolean(user.is_anonymous)})
    }

    if(action!=='status')return reply({error:'unknown action'},400)
    const marked=await markActiveEvaluation(admin,user.id)
    const {data:latest,error:latestError}=await admin.from('paper_evaluations').select('*').eq('user_id',user.id).order('attempt_no',{ascending:false}).limit(1).maybeSingle()
    if(latestError)throw new Error(latestError.message)
    const {data:funded}=await admin.from('paper_funded_profiles').select('stage,kyc_status,payout_wallet_address,payout_wallet_verified_at').eq('user_id',user.id).maybeSingle()
    const {data:flags}=await admin.from('paper_platform_flags').select('real_funded_activation,real_payouts_enabled,kyc_provider_configured,turnkey_signing_enabled').eq('id',true).maybeSingle()
    return reply({
      ok:true,
      anonymous:Boolean(user.is_anonymous),
      hasEvaluation:Boolean(latest),
      evaluation:marked?{...latest,...marked}:latest,
      funded:funded||null,
      platform:flags||{real_funded_activation:false,real_payouts_enabled:false,kyc_provider_configured:false,turnkey_signing_enabled:false},
      rules:{startingBalanceUsd:1000,profitTargetUsd:5000,passEquityUsd:6000,trailingDrawdownPct:10,maxDailyLossUsd:50,maxPositionPct:25,maxSingleTradePct:25,maxOpenPositions:5,minTrades:1,windowDays:30,cooldownHours:24,feeBps:100,timezone:'UTC'},
    })
  }catch(error){return reply({error:error instanceof Error?error.message:'unknown error'},500)}
})
