import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})
const finite=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback}
const REQUIRED_LEGAL=[['tos','v2'],['privacy','v1'],['risk_disclosure','v2']] as const

function envKeys(){
  const url=Deno.env.get('SUPABASE_URL')
  const publishableKeys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}')
  const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
  const publishable=publishableKeys.default||Deno.env.get('SUPABASE_ANON_KEY')
  const secret=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!publishable||!secret)throw new Error('server auth configuration missing')
  return{url,publishable,secret}
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(req.method!=='POST')return json({error:'method not allowed'},405)

  try{
    const authHeader=req.headers.get('Authorization')
    if(!authHeader?.startsWith('Bearer '))return json({error:'PAPER account required'},401)

    const {url,publishable,secret}=envKeys()
    const userClient=createClient(url,publishable,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}})
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:userData,error:userError}=await userClient.auth.getUser()
    if(userError||!userData.user)return json({error:'invalid session'},401)
    const uid=userData.user.id

    const body=await req.json().catch(()=>({}))
    const action=String(body?.action||'list').toLowerCase()

    const {data:rate}=await admin.rpc('paper_consume_server_rate_limit_v1',{
      p_scope:'advanced-paper-orders',
      p_subject:uid,
      p_limit:60,
      p_window_seconds:60,
    })
    if(rate?.allowed===false)return json({error:'Too many conditional-order requests.',retryAfterSeconds:rate.retry_after_seconds},429)

    if(action==='list'){
      const {data,error}=await admin.from('paper_conditional_orders')
        .select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(100)
      if(error)throw new Error(error.message)
      return json({ok:true,orders:data||[]})
    }

    if(action==='cancel'){
      const id=String(body?.id||'')
      if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:'invalid order id'},400)
      const {data,error}=await admin.from('paper_conditional_orders')
        .update({status:'cancelled',updated_at:new Date().toISOString(),rejection_reason:null})
        .eq('id',id).eq('user_id',uid).eq('status','pending')
        .select('*').maybeSingle()
      if(error)throw new Error(error.message)
      if(!data)return json({error:'Pending order not found or already processing.'},409)
      return json({ok:true,order:data})
    }

    if(action==='cancel_all'){
      const {data,error}=await admin.from('paper_conditional_orders')
        .update({status:'cancelled',updated_at:new Date().toISOString(),rejection_reason:null})
        .eq('user_id',uid).eq('status','pending')
        .select('id')
      if(error)throw new Error(error.message)
      return json({ok:true,cancelled:(data||[]).length})
    }

    if(action!=='create')return json({error:'unsupported action'},400)

    const [{data:control},{data:profile,error:profileError},{data:accepted,error:legalError},{data:activeEvaluation,error:evaluationError}]=await Promise.all([
      admin.from('paper_control_plane').select('emergency_pause,paper_trading_enabled,maintenance_message').eq('id',true).maybeSingle(),
      admin.from('profiles').select('profile_completed').eq('id',uid).maybeSingle(),
      admin.from('legal_acceptances').select('document_type,document_version').eq('user_id',uid),
      admin.from('paper_evaluations').select('id,status').eq('user_id',uid).eq('status','active').limit(1).maybeSingle(),
    ])
    if(control?.emergency_pause||control?.paper_trading_enabled===false)return json({error:control?.maintenance_message||'PAPER trading is temporarily paused.',code:'PLATFORM_PAUSED'},503)
    if(profileError)throw new Error(profileError.message)
    if(!profile?.profile_completed)return json({error:'Complete your PAPER trader profile before placing an order.',code:'ONBOARDING_REQUIRED'},403)
    if(legalError)throw new Error(legalError.message)
    if(evaluationError)throw new Error(evaluationError.message)
    if(activeEvaluation)return json({error:'Conditional orders are disabled during an active evaluation so evaluation rules cannot be bypassed.',code:'EVALUATION_CONDITIONAL_DISABLED'},409)

    const acceptedSet=new Set((accepted||[]).map((r:any)=>String(r.document_type)+':'+String(r.document_version)))
    const missing=REQUIRED_LEGAL.filter(([type,version])=>!acceptedSet.has(type+':'+version))
    if(missing.length)return json({error:'Accept the current Terms, Privacy Policy, and Risk Disclosure before PAPER trading.',code:'LEGAL_ACCEPTANCE_REQUIRED'},403)

    const mint=String(body?.mint||'').trim()
    const symbol=String(body?.symbol||'').trim().slice(0,32)||null
    const side=String(body?.side||'').toLowerCase()
    const orderType=String(body?.orderType||'').toLowerCase()
    const triggerPriceUsd=finite(body?.triggerPriceUsd)
    const amountSol=finite(body?.amountSol)
    const sellPct=finite(body?.sellPct)
    const expiresInHours=Math.max(1,Math.min(168,Math.round(finite(body?.expiresInHours,24))))
    const slippageBps=Math.max(10,Math.min(5000,finite(body?.slippageBps,1000)))
    const priorityFeeSol=Math.max(0,Math.min(.1,finite(body?.priorityFeeSol,0)))
    const dexFeeBps=Math.max(0,Math.min(500,finite(body?.dexFeeBps,30)))
    const idempotencyKey=String(body?.idempotencyKey||'').trim()

    if(!/^[1-9A-HJ-NP-Za-km-z]{32,60}$/.test(mint))return json({error:'invalid Solana mint'},400)
    if(side!=='buy'&&side!=='sell')return json({error:'side must be buy or sell'},400)
    if(!['limit','stop_loss','take_profit'].includes(orderType))return json({error:'invalid conditional order type'},400)
    if(orderType!=='limit'&&side!=='sell')return json({error:'stop-loss and take-profit orders must be sells'},400)
    if(triggerPriceUsd<=0)return json({error:'trigger price must be positive'},400)
    if(idempotencyKey.length<8||idempotencyKey.length>128)return json({error:'idempotency key required'},400)
    if(side==='buy'&&(amountSol<=0||amountSol>1000))return json({error:'invalid PAPER SOL amount'},400)
    if(side==='sell'&&(sellPct<=0||sellPct>100))return json({error:'sellPct must be between 0 and 100'},400)

    if(side==='sell'){
      const {data:tokenRow,error:tokenError}=await admin.from('tokens').select('id').eq('mint_address',mint).maybeSingle()
      if(tokenError)throw new Error(tokenError.message)
      if(!tokenRow)return json({error:'no PAPER position for token'},422)
      const {data:position,error:positionError}=await admin.from('paper_positions')
        .select('id,quantity_tokens').eq('user_id',uid).eq('token_id',tokenRow.id).eq('status','open').gt('quantity_tokens',0).maybeSingle()
      if(positionError)throw new Error(positionError.message)
      if(!position)return json({error:'no open PAPER position'},422)
    }

    const fingerprint=[side,mint,orderType,triggerPriceUsd.toPrecision(15),side==='buy'?amountSol.toPrecision(15):sellPct.toPrecision(12),expiresInHours,slippageBps,priorityFeeSol.toFixed(9),dexFeeBps].join('|')
    const {data:existing,error:existingError}=await admin.from('paper_conditional_orders')
      .select('*').eq('user_id',uid).eq('idempotency_key',idempotencyKey).maybeSingle()
    if(existingError)throw new Error(existingError.message)
    if(existing){
      const existingFingerprint=String(existing.metadata?.request_fingerprint||'')
      if(existingFingerprint&&existingFingerprint!==fingerprint)return json({error:'Idempotency key was already used for a different conditional order.',code:'IDEMPOTENCY_CONFLICT'},409)
      return json({ok:true,paper:true,replayed:true,order:existing})
    }

    const row={
      user_id:uid,
      idempotency_key:idempotencyKey,
      token_address:mint,
      token_symbol:symbol,
      side,
      order_type:orderType,
      trigger_price_usd:triggerPriceUsd,
      amount_sol:side==='buy'?amountSol:null,
      sell_pct:side==='sell'?sellPct:null,
      status:'pending',
      expires_at:new Date(Date.now()+expiresInHours*3600_000).toISOString(),
      metadata:{source:'terminal',created_price_usd:finite(body?.currentPriceUsd)||null,slippage_bps:slippageBps,priority_fee_sol:priorityFeeSol,dex_fee_bps:dexFeeBps,execution_model:'v4_constant_product_slippage',request_fingerprint:fingerprint},
      updated_at:new Date().toISOString(),
    }

    const {data,error}=await admin.from('paper_conditional_orders').insert(row).select('*').single()
    if(error){
      if(String((error as any).code||'')==='23505'){
        const {data:replay,error:replayError}=await admin.from('paper_conditional_orders')
          .select('*').eq('user_id',uid).eq('idempotency_key',idempotencyKey).maybeSingle()
        if(replayError)throw new Error(replayError.message)
        if(replay){
          const replayFingerprint=String(replay.metadata?.request_fingerprint||'')
          if(replayFingerprint&&replayFingerprint!==fingerprint)return json({error:'Idempotency key was already used for a different conditional order.',code:'IDEMPOTENCY_CONFLICT'},409)
          return json({ok:true,paper:true,replayed:true,order:replay})
        }
      }
      throw new Error(error.message)
    }
    return json({ok:true,paper:true,replayed:false,order:data})
  }catch(error){
    return json({error:error instanceof Error?error.message:'conditional order failed'},500)
  }
})
