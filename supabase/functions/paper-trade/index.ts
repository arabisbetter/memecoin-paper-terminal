import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})

type Pair={chainId?:string;dexId?:string;pairAddress?:string;baseToken?:{address?:string;name?:string;symbol?:string};priceUsd?:string;marketCap?:number;fdv?:number;liquidity?:{usd?:number};info?:{imageUrl?:string}}
const finite=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback}
const REQUIRED_LEGAL=[['tos','v2'],['privacy','v1'],['risk_disclosure','v2']] as const
const PAPER_FEE_BPS=100

async function fetchJson(url:string,timeoutMs=6500){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs)
  try{const r=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});if(!r.ok)throw new Error(`market data unavailable (${r.status})`);return await r.json()}finally{clearTimeout(timer)}
}
async function fetchPairs(mint:string):Promise<Pair[]>{const b=await fetchJson(`https://api.dexscreener.com/token-pairs/v1/solana/${encodeURIComponent(mint)}`);return Array.isArray(b)?b:[]}
async function bestPair(mint:string){const pairs=await fetchPairs(mint);const valid=pairs.filter(p=>p.chainId==='solana'&&finite(p.priceUsd)>0);if(!valid.length)throw new Error('no live Solana market found for token');valid.sort((a,b)=>finite(b.liquidity?.usd)-finite(a.liquidity?.usd));return valid[0]}
async function solUsd(){const p=await bestPair('So11111111111111111111111111111111111111112');const price=finite(p.priceUsd);if(price<=0)throw new Error('SOL/USD unavailable');return price}

async function authoritativeEquity(admin:any,userId:string){
  const [{data:account,error:accountError},{data:positions,error:positionError}]=await Promise.all([
    admin.from('paper_accounts').select('cash_usd').eq('user_id',userId).maybeSingle(),
    admin.from('paper_positions').select('id,token_id,quantity_tokens').eq('user_id',userId).eq('status','open').eq('accounting_version','usd_v2').gt('quantity_tokens',0),
  ])
  if(accountError)throw new Error(accountError.message);if(positionError)throw new Error(positionError.message);if(!account)throw new Error('PAPER account not found')
  const open=(positions||[]) as {id:string;token_id:string;quantity_tokens:number}[]
  if(!open.length)return {cashUsd:finite(account.cash_usd),openValueUsd:0,equityUsd:finite(account.cash_usd),positions:[] as {positionId:string;mint:string;quantityTokens:number;priceUsd:number;valueUsd:number}[]}
  const ids=[...new Set(open.map(p=>p.token_id))]
  const {data:tokens,error:tokenError}=await admin.from('tokens').select('id,mint_address').in('id',ids)
  if(tokenError)throw new Error(tokenError.message)
  const mintById=new Map<string,string>((tokens||[]).map((t:any)=>[String(t.id),String(t.mint_address)] as [string,string]))
  if(mintById.size!==ids.length)throw new Error('evaluation mark unavailable: token metadata missing')
  const marks=await Promise.all(open.map(async p=>{const mint=mintById.get(String(p.token_id));if(!mint)throw new Error('evaluation mark unavailable: token mint missing');const started=Date.now(),pair=await bestPair(mint),ageMs=Date.now()-started;if(ageMs>10_000)throw new Error('evaluation mark unavailable: stale market data');const priceUsd=finite(pair.priceUsd);return {positionId:p.id,mint,quantityTokens:finite(p.quantity_tokens),priceUsd,valueUsd:finite(p.quantity_tokens)*priceUsd}}))
  const cashUsd=finite(account.cash_usd),openValueUsd=marks.reduce((s,p)=>s+p.valueUsd,0)
  return {cashUsd,openValueUsd,equityUsd:cashUsd+openValueUsd,positions:marks}
}

async function getActiveEvaluation(admin:any,userId:string){
  const {data,error}=await admin.from('paper_evaluations').select('*').eq('user_id',userId).eq('status','active').order('starts_at',{ascending:false}).limit(1).maybeSingle()
  if(error)throw new Error(error.message);return data
}
async function markEvaluation(admin:any,userId:string){
  const active=await getActiveEvaluation(admin,userId);if(!active)return null
  try{
    const equity=await authoritativeEquity(admin,userId)
    const {data,error}=await admin.rpc('paper_record_evaluation_mark_v1',{p_user_id:userId,p_equity_usd:equity.equityUsd,p_cash_usd:equity.cashUsd,p_open_value_usd:equity.openValueUsd,p_source:'paper_trade_live_marks',p_data_status:'LIVE'})
    if(error)throw new Error(error.message)
    return {...data,positions:equity.positions}
  }catch(error){
    const message=error instanceof Error?error.message:'evaluation mark unavailable'
    await admin.from('paper_evaluations').update({data_status:'UNAVAILABLE',last_mark_source:'paper_trade_mark_failed',updated_at:new Date().toISOString()}).eq('id',active.id)
    return {active:true,id:active.id,status:'active',data_status:'UNAVAILABLE',mark_error:message}
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(req.method!=='POST')return json({error:'method not allowed'},405)
  let admin:ReturnType<typeof createClient>|null=null
  let userIdForLog:string|null=null
  try{
    const authHeader=req.headers.get('Authorization')
    if(!authHeader?.startsWith('Bearer '))return json({error:'PAPER account required'},401)
    const publishableKeys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}')
    const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
    const publishableKey=publishableKeys.default||Deno.env.get('SUPABASE_ANON_KEY')
    const secretKey=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseUrl=Deno.env.get('SUPABASE_URL')
    if(!supabaseUrl||!publishableKey||!secretKey)throw new Error('server auth configuration missing')
    const userClient=createClient(supabaseUrl,publishableKey,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}})
    const {data:userData,error:userError}=await userClient.auth.getUser()
    if(userError||!userData.user)return json({error:'invalid session'},401)
    const uid=userData.user.id;userIdForLog=uid
    admin=createClient(supabaseUrl,secretKey,{auth:{persistSession:false,autoRefreshToken:false}})

    const {data:profile,error:profileError}=await admin.from('profiles').select('profile_completed').eq('id',uid).maybeSingle()
    if(profileError)throw new Error(profileError.message)
    if(!profile?.profile_completed)return json({error:'Complete your PAPER trader profile before placing an order.',code:'ONBOARDING_REQUIRED'},403)

    const {data:accepted,error:legalError}=await admin.from('legal_acceptances').select('document_type,document_version').eq('user_id',uid)
    if(legalError)throw new Error(legalError.message)
    const acceptedSet=new Set((accepted||[]).map((r:any)=>`${r.document_type}:${r.document_version}`))
    const missing=REQUIRED_LEGAL.filter(([type,version])=>!acceptedSet.has(`${type}:${version}`))
    if(missing.length)return json({error:'Accept the current Terms, Privacy Policy, and Risk Disclosure before PAPER trading.',code:'LEGAL_ACCEPTANCE_REQUIRED',missing:missing.map(([type,version])=>({type,version}))},403)

    const minuteAgo=new Date(Date.now()-60_000).toISOString(),hourAgo=new Date(Date.now()-3_600_000).toISOString()
    const [{count:minuteCount},{count:hourCount}]=await Promise.all([
      admin.from('trade_rate_events').select('id',{count:'exact',head:true}).eq('user_id',uid).gte('created_at',minuteAgo),
      admin.from('trade_rate_events').select('id',{count:'exact',head:true}).eq('user_id',uid).gte('created_at',hourAgo),
    ])
    if((minuteCount||0)>=20||(hourCount||0)>=300){await admin.from('observability_events').insert({event_type:'paper_trade_rate_limit',severity:'warning',user_id:uid,details:{minuteCount,hourCount}});return json({error:'Too many PAPER order requests. Please wait a moment and try again.'},429)}
    await admin.from('trade_rate_events').insert({user_id:uid})
    const {data:risk}=await admin.from('account_security').select('flagged_for_review').eq('user_id',uid).maybeSingle()

    const body=await req.json()
    const mint=String(body?.mint||'').trim(),side=String(body?.side||'').toLowerCase(),idempotencyKey=String(body?.idempotencyKey||'').trim()
    if(!/^[1-9A-HJ-NP-Za-km-z]{32,60}$/.test(mint))return json({error:'invalid Solana mint'},400)
    if(side!=='buy'&&side!=='sell')return json({error:'side must be buy or sell'},400)
    if(idempotencyKey.length<8||idempotencyKey.length>128)return json({error:'idempotency key required'},400)

    const activeEvaluation=await getActiveEvaluation(admin,uid)
    const preMark=activeEvaluation?await markEvaluation(admin,uid):null
    if(activeEvaluation&&preMark?.status&&preMark.status!=='active')return json({error:`Evaluation is ${preMark.status}.`,code:'EVALUATION_ENDED',evaluation:preMark},409)
    if(activeEvaluation&&side==='buy'&&preMark?.data_status!=='LIVE')return json({error:'Live equity could not be marked across every open position. New evaluation buys are paused rather than using an invented price.',code:'EVALUATION_MARK_UNAVAILABLE',evaluation:preMark},503)

    const marketStarted=Date.now()
    const [pair,solPrice]=await Promise.all([bestPair(mint),solUsd()])
    const quoteTimestamp=new Date().toISOString(),marketDataAgeMs=Math.max(0,Date.now()-marketStarted)
    if(marketDataAgeMs>10_000)return json({error:'Live market data is stale. New PAPER orders are temporarily paused.',code:'STALE_MARKET'},503)
    const displayedPrice=finite(pair.priceUsd),marketCap=finite(pair.marketCap??pair.fdv),liquidity=finite(pair.liquidity?.usd)
    if(displayedPrice<=0||liquidity<=0)return json({error:'token has insufficient live market data'},422)
    const oneSideLiquidityUsd=Math.max(liquidity/2,1)
    const feeBps=PAPER_FEE_BPS,feeRate=feeBps/10_000
    const executionModelVersion='v3_evaluation_liquidity_approximation',quality='estimated'

    if(side==='buy'){
      const amountSol=finite(body?.amountSol)
      if(amountSol<=0||amountSol>1000)return json({error:'invalid PAPER SOL amount'},400)
      const notionalUsd=amountSol*solPrice
      if(activeEvaluation&&preMark?.data_status==='LIVE'){
        const equity=finite(preMark.equity_usd),limit=equity*.25
        if(notionalUsd>limit+0.000001)return json({error:`Evaluation max single trade is 25% of live equity (${limit.toFixed(2)} PAPER USD).`,code:'EVALUATION_TRADE_CAP',evaluation:preMark},422)
        const marks=Array.isArray(preMark.positions)?preMark.positions:[],existing=marks.find((p:any)=>p.mint===mint),existingValue=finite(existing?.valueUsd)
        if(existingValue+notionalUsd>limit+0.000001)return json({error:'This buy would exceed the 25% per-token concentration cap.',code:'EVALUATION_CONCENTRATION_CAP',evaluation:preMark},422)
        if(!existing&&marks.length>=5)return json({error:'Evaluation allows at most 5 simultaneous open positions.',code:'EVALUATION_POSITION_LIMIT',evaluation:preMark},422)
      }
      const impactRatio=Math.min(notionalUsd/oneSideLiquidityUsd,5)
      const fillPrice=displayedPrice*(1+impactRatio),impactPct=impactRatio*100,fillMc=marketCap>0?marketCap*(fillPrice/displayedPrice):0,feeUsd=notionalUsd*feeRate
      const requestFingerprint=`buy|${mint}|${amountSol.toFixed(12)}`
      const {data,error}=await admin.rpc('execute_paper_buy_v2',{p_user_id:uid,p_idempotency_key:idempotencyKey,p_request_fingerprint:requestFingerprint,p_mint:mint,p_ticker:pair.baseToken?.symbol||null,p_name:pair.baseToken?.name||null,p_image_url:pair.info?.imageUrl||null,p_pair_address:pair.pairAddress||null,p_dex_id:pair.dexId||null,p_amount_sol:amountSol,p_notional_usd:notionalUsd,p_displayed_price_usd:displayedPrice,p_fill_price_usd:fillPrice,p_displayed_mc_usd:marketCap||null,p_fill_mc_usd:fillMc||null,p_liquidity_usd:liquidity,p_price_impact_pct:impactPct,p_fee_usd:feeUsd,p_sol_price_usd:solPrice,p_quote_timestamp:quoteTimestamp,p_market_data_age_ms:marketDataAgeMs,p_execution_quality:quality,p_execution_model_version:executionModelVersion})
      if(error)throw new Error(error.message)
      const evaluation=activeEvaluation?await markEvaluation(admin,uid):null
      return json({ok:true,paper:true,side:'buy',underReview:Boolean(risk?.flagged_for_review),dataStatus:'LIVE',market:{referencePriceUsd:displayedPrice,displayedMcUsd:marketCap,liquidityUsd:liquidity,solUsd:solPrice,quoteTimestamp,marketDataAgeMs},fill:{requestedAmountUsd:notionalUsd,requestedAmountNative:amountSol,simulatedFillPriceUsd:fillPrice,simulatedFillMcUsd:fillMc,priceImpactPct:impactPct,paperFeeUsd:feeUsd,feeBps,executionQuality:quality,executionModelVersion},account:data,evaluation})
    }

    const sellPct=finite(body?.sellPct)
    if(sellPct<=0||sellPct>100)return json({error:'sellPct must be between 0 and 100'},400)
    const {data:tokenRow}=await admin.from('tokens').select('id').eq('mint_address',mint).maybeSingle()
    if(!tokenRow)return json({error:'no PAPER position for token'},422)
    const {data:position,error:positionError}=await admin.from('paper_positions').select('quantity_tokens,accounting_version').eq('user_id',uid).eq('token_id',tokenRow.id).eq('status','open').maybeSingle()
    if(positionError||!position)return json({error:'no open PAPER position'},422)
    if(position.accounting_version!=='usd_v2')return json({error:'legacy PAPER position cannot be sold in USD mode'},422)
    const sellQty=finite(position.quantity_tokens)*(sellPct/100),grossUsd=sellQty*displayedPrice,impactRatio=Math.min(grossUsd/oneSideLiquidityUsd,5)
    const fillPrice=displayedPrice/(1+impactRatio),impactPct=(1-fillPrice/displayedPrice)*100,fillMc=marketCap>0?marketCap*(fillPrice/displayedPrice):0
    const grossFillUsd=sellQty*fillPrice,feeUsd=grossFillUsd*feeRate,requestFingerprint=`sell|${mint}|${sellPct.toFixed(6)}`
    const {data,error}=await admin.rpc('execute_paper_sell_v2',{p_user_id:uid,p_idempotency_key:idempotencyKey,p_request_fingerprint:requestFingerprint,p_mint:mint,p_sell_pct:sellPct,p_displayed_price_usd:displayedPrice,p_fill_price_usd:fillPrice,p_displayed_mc_usd:marketCap||null,p_fill_mc_usd:fillMc||null,p_liquidity_usd:liquidity,p_price_impact_pct:impactPct,p_fee_usd:feeUsd,p_sol_price_usd:solPrice,p_quote_timestamp:quoteTimestamp,p_market_data_age_ms:marketDataAgeMs,p_execution_quality:quality,p_execution_model_version:executionModelVersion})
    if(error)throw new Error(error.message)
    const evaluation=activeEvaluation?await markEvaluation(admin,uid):null
    return json({ok:true,paper:true,side:'sell',underReview:Boolean(risk?.flagged_for_review),dataStatus:'LIVE',market:{referencePriceUsd:displayedPrice,displayedMcUsd:marketCap,liquidityUsd:liquidity,solUsd:solPrice,quoteTimestamp,marketDataAgeMs},fill:{requestedAmountUsd:grossFillUsd,requestedSellPct:sellPct,simulatedFillPriceUsd:fillPrice,simulatedFillMcUsd:fillMc,priceImpactPct:impactPct,paperFeeUsd:feeUsd,feeBps,executionQuality:quality,executionModelVersion},account:data,evaluation})
  }catch(error){
    const message=error instanceof Error?error.message:'unknown error'
    if(admin&&userIdForLog){try{await admin.from('observability_events').insert({event_type:'paper_trade_failure',severity:'error',user_id:userIdForLog,details:{message}})}catch{}}
    const status=/insufficient PAPER buying power|no open PAPER position|PAPER account not found|legacy PAPER position/.test(message)?422:/market data is stale|evaluation mark unavailable/.test(message)?503:500
    return json({error:message},status)
  }
})
