import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { quotePaperExecution, EXECUTION_MODEL_VERSION } from '../_shared/execution-model.mjs'

type Pair={chainId?:string;dexId?:string;pairAddress?:string;baseToken?:{address?:string;name?:string;symbol?:string};priceUsd?:string;marketCap?:number;fdv?:number;liquidity?:{usd?:number};info?:{imageUrl?:string}}
type Order={id:string;user_id:string;idempotency_key:string;token_address:string;token_symbol:string|null;side:'buy'|'sell';order_type:'limit'|'stop_loss'|'take_profit';trigger_price_usd:number;amount_sol:number|null;sell_pct:number|null;status:string;expires_at:string|null;created_at:string;metadata?:Record<string,unknown>|null}
const finite=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback}
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})

function envKeys(){
  const url=Deno.env.get('SUPABASE_URL')
  const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
  const secret=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!secret)throw new Error('server auth configuration missing')
  return{url,secret}
}
async function heartbeat(admin:any,status:'healthy'|'degraded'|'failed',startedMs:number,details:Record<string,unknown>,error?:string){
  const now=new Date().toISOString()
  const {data:current}=await admin.from('paper_operational_heartbeats').select('consecutive_failures').eq('component','conditional_order_monitor').maybeSingle()
  await admin.from('paper_operational_heartbeats').upsert({
    component:'conditional_order_monitor',status,last_started_at:new Date(startedMs).toISOString(),
    last_success_at:status==='failed'?undefined:now,last_failure_at:status==='failed'?now:undefined,
    consecutive_failures:status==='failed'?Number(current?.consecutive_failures||0)+1:0,
    latency_ms:Math.max(0,Date.now()-startedMs),
    details:error?{...details,error:String(error).slice(0,500)}:details,updated_at:now,
  },{onConflict:'component'})
}
async function fetchJson(url:string,timeoutMs=7000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs)
  try{
    const r=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal})
    if(!r.ok)throw new Error('market data unavailable ('+r.status+')')
    return await r.json()
  }finally{clearTimeout(timer)}
}
async function bestPair(mint:string):Promise<Pair>{
  const body=await fetchJson('https://api.dexscreener.com/token-pairs/v1/solana/'+encodeURIComponent(mint))
  const pairs=(Array.isArray(body)?body:[]) as Pair[]
  const valid=pairs.filter(p=>p.chainId==='solana'&&finite(p.priceUsd)>0)
  if(!valid.length)throw new Error('no live Solana market found for token')
  valid.sort((a,b)=>finite(b.liquidity?.usd)-finite(a.liquidity?.usd))
  return valid[0]
}
async function solUsd(){
  const p=await bestPair('So11111111111111111111111111111111111111112')
  const price=finite(p.priceUsd)
  if(price<=0)throw new Error('SOL/USD unavailable')
  return price
}
function shouldTrigger(order:Order,price:number){
  if(order.order_type==='stop_loss')return price<=finite(order.trigger_price_usd)
  if(order.order_type==='take_profit')return price>=finite(order.trigger_price_usd)
  return order.side==='buy'?price<=finite(order.trigger_price_usd):price>=finite(order.trigger_price_usd)
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return reply({error:'method not allowed'},405)
  const startedMs=Date.now()
  let admin:any=null
  const stats={checked:0,triggered:0,filled:0,rejected:0,expired:0,recovered:0,waiting:0,errors:0}
  try{
    const {url,secret}=envKeys()
    admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const token=req.headers.get('x-paper-internal-token')||''
    const {data:valid,error:tokenError}=await admin.rpc('paper_verify_internal_token',{p_token:token})
    if(tokenError||valid!==true)return reply({error:'unauthorized'},401)

    const {data:control}=await admin.from('paper_control_plane').select('emergency_pause,paper_trading_enabled').eq('id',true).maybeSingle()
    if(control?.emergency_pause||control?.paper_trading_enabled===false){
      await heartbeat(admin,'healthy',startedMs,{paused:true,...stats})
      return reply({ok:true,paused:true,...stats})
    }

    const now=new Date()
    const staleProcessing=new Date(now.getTime()-2*60_000).toISOString()

    const {data:recovered,error:recoverError}=await admin.from('paper_conditional_orders')
      .update({status:'pending',processing_started_at:null,updated_at:now.toISOString(),rejection_reason:null})
      .eq('status','processing').lt('processing_started_at',staleProcessing).select('id')
    if(recoverError)throw new Error(recoverError.message)
    stats.recovered=(recovered||[]).length

    const {data:expired,error:expireError}=await admin.from('paper_conditional_orders')
      .update({status:'expired',updated_at:now.toISOString(),rejection_reason:'Order expired before trigger.'})
      .eq('status','pending').lt('expires_at',now.toISOString()).select('id')
    if(expireError)throw new Error(expireError.message)
    stats.expired=(expired||[]).length

    const {data:orders,error:orderError}=await admin.from('paper_conditional_orders')
      .select('id,user_id,idempotency_key,token_address,token_symbol,side,order_type,trigger_price_usd,amount_sol,sell_pct,status,expires_at,created_at,metadata')
      .eq('status','pending').order('created_at',{ascending:true}).limit(100)
    if(orderError)throw new Error(orderError.message)

    if(!orders?.length){
      await heartbeat(admin,'healthy',startedMs,{idle:true,...stats})
      return reply({ok:true,...stats})
    }

    let currentSolUsd=0
    const cache=new Map<string,Pair>()
    for(const raw of orders as Order[]){
      stats.checked++
      try{
        const {data:evalRow}=await admin.from('paper_evaluations').select('id').eq('user_id',raw.user_id).eq('status','active').limit(1).maybeSingle()
        if(evalRow){
          await admin.from('paper_conditional_orders').update({status:'rejected',rejection_reason:'Conditional orders are disabled during an active evaluation.',updated_at:new Date().toISOString()}).eq('id',raw.id).eq('status','pending')
          stats.rejected++
          continue
        }

        let pair=cache.get(raw.token_address)
        if(!pair){pair=await bestPair(raw.token_address);cache.set(raw.token_address,pair)}
        const displayedPrice=finite(pair.priceUsd),marketCap=finite(pair.marketCap??pair.fdv),liquidity=finite(pair.liquidity?.usd)
        if(displayedPrice<=0||liquidity<=0){stats.waiting++;continue}

        await admin.from('paper_conditional_orders').update({current_price_usd:displayedPrice,updated_at:new Date().toISOString()}).eq('id',raw.id).eq('status','pending')
        if(!shouldTrigger(raw,displayedPrice)){stats.waiting++;continue}

        const {data:claimed,error:claimError}=await admin.from('paper_conditional_orders')
          .update({status:'processing',processing_started_at:new Date().toISOString(),triggered_at:new Date().toISOString(),current_price_usd:displayedPrice,updated_at:new Date().toISOString()})
          .eq('id',raw.id).eq('status','pending').select('id').maybeSingle()
        if(claimError)throw new Error(claimError.message)
        if(!claimed)continue
        stats.triggered++

        const quoteTimestamp=new Date().toISOString()
        const executionModelVersion=EXECUTION_MODEL_VERSION
        const executionQuality='modeled'
        const slippageLimitBps=Math.max(10,Math.min(5000,finite(raw.metadata?.slippage_bps,1000)))
        const priorityFeeSol=Math.max(0,Math.min(.1,finite(raw.metadata?.priority_fee_sol,0)))
        const dexFeeBps=Math.max(0,Math.min(500,finite(raw.metadata?.dex_fee_bps,30)))
        let result:any=null

        if(raw.side==='buy'){
          if(!currentSolUsd)currentSolUsd=await solUsd()
          const amountSol=finite(raw.amount_sol),notionalUsd=amountSol*currentSolUsd
          const execution=quotePaperExecution({side:'buy',referencePriceUsd:displayedPrice,marketCapUsd:marketCap,liquidityUsd:liquidity,notionalUsd,solUsd:currentSolUsd,dexFeeBps,slippageLimitBps,priorityFeeSol})
          if(execution.rejected)throw new Error('slippage limit exceeded')
          const {data,error}=await admin.rpc('execute_paper_buy_v3',{
            p_user_id:raw.user_id,p_idempotency_key:'conditional:'+raw.id,p_request_fingerprint:'conditional-buy|'+raw.id+'|'+slippageLimitBps+'|'+priorityFeeSol+'|'+dexFeeBps,
            p_mint:raw.token_address,p_ticker:raw.token_symbol||pair.baseToken?.symbol||null,p_name:pair.baseToken?.name||null,p_image_url:pair.info?.imageUrl||null,
            p_pair_address:pair.pairAddress||null,p_dex_id:pair.dexId||null,p_amount_sol:amountSol,p_notional_usd:notionalUsd,p_displayed_price_usd:displayedPrice,
            p_fill_price_usd:execution.fillPriceUsd,p_displayed_mc_usd:marketCap||null,p_fill_mc_usd:execution.fillMarketCapUsd||null,p_liquidity_usd:liquidity,
            p_price_impact_pct:execution.priceImpactPct,p_effective_slippage_bps:execution.effectiveSlippageBps,p_paper_fee_usd:execution.paperFeeUsd,
            p_dex_fee_usd:execution.dexFeeUsd,p_network_fee_usd:execution.networkFeeUsd,p_priority_fee_sol:priorityFeeSol,p_post_trade_price_usd:execution.postTradePriceUsd,
            p_slippage_limit_bps:slippageLimitBps,p_sol_price_usd:currentSolUsd,p_quote_timestamp:quoteTimestamp,p_market_data_age_ms:0,
            p_execution_quality:executionQuality,p_execution_model_version:executionModelVersion,
          })
          if(error)throw new Error(error.message)
          result=data
        }else{
          if(!currentSolUsd)currentSolUsd=await solUsd()
          const {data:tokenRow,error:tokenError}=await admin.from('tokens').select('id').eq('mint_address',raw.token_address).maybeSingle()
          if(tokenError)throw new Error(tokenError.message)
          if(!tokenRow)throw new Error('no PAPER position for token')
          const {data:position,error:positionError}=await admin.from('paper_positions').select('quantity_tokens,accounting_version').eq('user_id',raw.user_id).eq('token_id',tokenRow.id).eq('status','open').maybeSingle()
          if(positionError||!position)throw new Error('no open PAPER position')
          if(position.accounting_version!=='usd_v2')throw new Error('legacy PAPER position cannot be sold in USD mode')
          const sellPct=finite(raw.sell_pct),sellQty=finite(position.quantity_tokens)*(sellPct/100),grossReferenceUsd=sellQty*displayedPrice
          const execution=quotePaperExecution({side:'sell',referencePriceUsd:displayedPrice,marketCapUsd:marketCap,liquidityUsd:liquidity,notionalUsd:grossReferenceUsd,solUsd:currentSolUsd,dexFeeBps,slippageLimitBps,priorityFeeSol})
          if(execution.rejected)throw new Error('slippage limit exceeded')
          const {data,error}=await admin.rpc('execute_paper_sell_v3',{
            p_user_id:raw.user_id,p_idempotency_key:'conditional:'+raw.id,p_request_fingerprint:'conditional-sell|'+raw.id+'|'+slippageLimitBps+'|'+priorityFeeSol+'|'+dexFeeBps,
            p_mint:raw.token_address,p_sell_pct:sellPct,p_displayed_price_usd:displayedPrice,p_fill_price_usd:execution.fillPriceUsd,p_displayed_mc_usd:marketCap||null,
            p_fill_mc_usd:execution.fillMarketCapUsd||null,p_liquidity_usd:liquidity,p_price_impact_pct:execution.priceImpactPct,p_effective_slippage_bps:execution.effectiveSlippageBps,
            p_paper_fee_usd:execution.paperFeeUsd,p_dex_fee_usd:execution.dexFeeUsd,p_network_fee_usd:execution.networkFeeUsd,p_priority_fee_sol:priorityFeeSol,
            p_post_trade_price_usd:execution.postTradePriceUsd,p_slippage_limit_bps:slippageLimitBps,p_sol_price_usd:currentSolUsd,p_quote_timestamp:quoteTimestamp,
            p_market_data_age_ms:0,p_execution_quality:executionQuality,p_execution_model_version:executionModelVersion,
          })
          if(error)throw new Error(error.message)
          result=data
        }

        await admin.from('paper_conditional_orders').update({
          status:'filled',executed_order_id:result?.order_id||null,current_price_usd:displayedPrice,
          filled_at:new Date().toISOString(),updated_at:new Date().toISOString(),rejection_reason:null,
          metadata:{...(raw.metadata||{}),monitor:true,execution_model:executionModelVersion,result_summary:{replayed:Boolean(result?.replayed)}}
        }).eq('id',raw.id)
        stats.filled++
      }catch(error){
        const message=error instanceof Error?error.message:'conditional execution failed'
        const transient=/market data unavailable|no live Solana market|SOL\/USD unavailable|stale market|fetch|abort|timed out|timeout/i.test(message)
        if(transient){
          await admin.from('paper_conditional_orders').update({
            status:'pending',processing_started_at:null,rejection_reason:'Live market data unavailable; retrying automatically.',updated_at:new Date().toISOString()
          }).eq('id',raw.id)
          stats.waiting++;stats.errors++
        }else{
          await admin.from('paper_conditional_orders').update({
            status:'rejected',rejection_reason:message.slice(0,500),updated_at:new Date().toISOString()
          }).eq('id',raw.id)
          stats.rejected++
        }
      }
    }

    await heartbeat(admin,stats.rejected?'degraded':'healthy',startedMs,stats)
    return reply({ok:true,...stats})
  }catch(error){
    const message=error instanceof Error?error.message:'conditional monitor failed'
    if(admin)try{await heartbeat(admin,'failed',startedMs,stats,message)}catch{}
    return reply({error:message,...stats},500)
  }
})
