import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-paper-internal-token'}
})
const finite=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback}

function envKeys(){
  const url=Deno.env.get('SUPABASE_URL')
  const pubKeys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}')
  const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
  const pub=pubKeys.default||Deno.env.get('SUPABASE_ANON_KEY')
  const secret=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!pub||!secret)throw new Error('server auth configuration missing')
  return{url,pub,secret}
}

async function authContext(req:Request,admin:any,url:string,pub:string){
  const internal=req.headers.get('x-paper-internal-token')||''
  if(internal){
    const {data}=await admin.rpc('paper_verify_internal_token',{p_token:internal})
    if(data===true)return{internal:true,user:null,role:'internal',strong:true}
  }

  const auth=req.headers.get('Authorization')
  if(!auth?.startsWith('Bearer '))throw new Error('AUTH_REQUIRED')
  const client=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await client.auth.getUser()
  if(error||!user)throw new Error('AUTH_REQUIRED')
  const {data:adminRow,error:adminError}=await admin.from('paper_admin_users')
    .select('role,enabled,requires_strong_auth').eq('user_id',user.id).maybeSingle()
  if(adminError)throw new Error(adminError.message)
  if(!adminRow?.enabled)throw new Error('ADMIN_REQUIRED')

  let strong=false
  try{
    const {data}=await client.auth.mfa.getAuthenticatorAssuranceLevel()
    strong=data?.currentLevel==='aal2'
  }catch{/* mutation paths will require AAL2 if configured */}

  return{
    internal:false,user,role:String(adminRow.role),
    strong:adminRow.requires_strong_auth===false?true:strong
  }
}

function allowed(role:string,roles:string[]){return roles.includes(role)}
async function audit(admin:any,ctx:any,action:string,targetType:string|null,targetId:string|null,beforeState:unknown,afterState:unknown,requestId:string){
  await admin.from('paper_admin_audit_log').insert({
    actor_user_id:ctx.user?.id||null,actor_role:ctx.role,action,target_type:targetType,target_id:targetId,
    before_state:beforeState??null,after_state:afterState??null,request_id:requestId
  })
}
async function flags(admin:any){
  const {data,error}=await admin.from('paper_platform_flags').select('*').eq('id',true).single()
  if(error)throw new Error(error.message)
  return data
}
function allLaunchGatesOpen(f:any){
  return Boolean(
    f?.legal_review_complete&&f?.legal_entity_ready&&f?.kyc_provider_configured&&
    f?.aml_sanctions_controls_ready&&f?.jurisdiction_allowlist_ready&&
    f?.custody_security_review_complete&&f?.turnkey_signing_enabled&&
    f?.treasury_capital_available
  )
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-paper-internal-token'}})
  if(req.method!=='POST')return reply({error:'method not allowed'},405)
  const requestId=crypto.randomUUID()
  try{
    const {url,pub,secret}=envKeys()
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const ctx=await authContext(req,admin,url,pub)
    const body=await req.json().catch(()=>({}))
    const action=String(body?.action||'dashboard')

    if(ctx.internal&&action!=='dashboard'&&action!=='run_abuse_scan')return reply({error:'internal token is read-only for admin control'},403)

    if(action==='dashboard'){
      const [
        flagRes,controlRes,treasuryRes,riskRes,providerRes,monitorRes,
        activeEvalRes,waitlistRes,abuseRes,fundedRes,approvalRes,auditRes
      ]=await Promise.all([
        admin.from('paper_platform_flags').select('*').eq('id',true).single(),
        admin.from('paper_control_plane').select('*').eq('id',true).single(),
        admin.from('paper_treasury_state').select('*').eq('id',true).single(),
        admin.from('paper_risk_policy').select('*').eq('id',true).single(),
        admin.from('paper_market_provider_health').select('*').order('provider'),
        admin.from('paper_evaluation_monitor_runs').select('*').order('id',{ascending:false}).limit(1).maybeSingle(),
        admin.from('paper_evaluations').select('id',{count:'exact',head:true}).eq('status','active'),
        admin.from('paper_funded_waitlist').select('status'),
        admin.from('paper_abuse_signals').select('id,severity,status,signal_type,user_id,related_user_id,detected_at').in('status',['open','frozen']).order('detected_at',{ascending:false}).limit(50),
        admin.from('paper_funded_profiles').select('stage'),
        admin.from('paper_admin_action_approvals').select('id,action_type,target_id,amount_usd,requested_by,status,requested_at').eq('status','pending').order('requested_at',{ascending:false}).limit(25),
        admin.from('paper_admin_audit_log').select('id,actor_user_id,actor_role,action,target_type,target_id,created_at').order('id',{ascending:false}).limit(50)
      ])
      const {data:settlements,error:settlementListError}=await admin.from('paper_funded_settlements')
        .select('id,user_id,week_start,week_end,eligible_profit_usd,trader_share_usd,paper_share_usd,status,payout_asset,payout_wallet_snapshot,approved_by,approved_at,second_approved_by,second_approved_at,payout_tx_signature,payout_asset_amount,payout_error,payout_attempts,payout_broadcast_at,payout_confirmation_slot,created_at,paid_at')
        .order('created_at',{ascending:false}).limit(50)
      if(settlementListError)throw new Error(settlementListError.message)
      const countBy=(rows:any[]|null|undefined,key:string)=>Object.fromEntries(
        Object.entries((rows||[]).reduce((a:any,r:any)=>{const k=String(r?.[key]||'unknown');a[k]=(a[k]||0)+1;return a},{}))
      )
      return reply({
        ok:true,requestId,role:ctx.role,strongAuth:ctx.strong,
        flags:flagRes.data,control:controlRes.data,treasury:treasuryRes.data,riskPolicy:riskRes.data,
        providers:providerRes.data||[],monitor:monitorRes.data||null,activeEvaluations:activeEvalRes.count||0,
        waitlist:countBy(waitlistRes.data,'status'),funded:countBy(fundedRes.data,'stage'),
        abuseSignals:abuseRes.data||[],pendingApprovals:approvalRes.data||[],settlements:settlements||[],audit:ctx.internal?[]:(auditRes.data||[])
      })
    }

    if(action==='traders'){
      const limit=Math.max(1,Math.min(100,Math.round(finite(body?.limit,50))))
      const search=String(body?.search||'').trim()
      let profileQuery=admin.from('profiles').select('id,username,display_name,avatar_url,avatar_emoji,created_at').order('created_at',{ascending:false}).limit(limit)
      if(search)profileQuery=profileQuery.or(`username.ilike.%${search.replace(/[%_,]/g,'')}%,display_name.ilike.%${search.replace(/[%_,]/g,'')}%`)
      const {data:profiles,error:profileError}=await profileQuery
      if(profileError)throw new Error(profileError.message)
      const ids=(profiles||[]).map((p:any)=>p.id)
      if(!ids.length)return reply({ok:true,traders:[]})
      const [evalRes,fundedRes,waitRes,securityRes,scaleRes]=await Promise.all([
        admin.from('paper_evaluations').select('user_id,status,attempt_no,last_equity_usd,peak_equity_usd,trades_count,failure_reason,passed_at,ended_at,updated_at').in('user_id',ids).order('attempt_no',{ascending:false}),
        admin.from('paper_funded_profiles').select('user_id,stage,kyc_status,payout_wallet_verified_at,updated_at').in('user_id',ids),
        admin.from('paper_funded_waitlist').select('user_id,status,priority,qualified_at,hold_reason,updated_at').in('user_id',ids),
        admin.from('account_security').select('user_id,flagged_for_review,risk_reasons,last_seen_at').in('user_id',ids),
        admin.from('paper_funded_scale_state').select('user_id,scale_level,capital_usd,consecutive_profitable_cycles,next_capital_usd,updated_at').in('user_id',ids),
      ])
      const latestEval=new Map<string,any>()
      for(const e of evalRes.data||[])if(!latestEval.has(String(e.user_id)))latestEval.set(String(e.user_id),e)
      const byUser=(rows:any[]|null|undefined)=>new Map((rows||[]).map((r:any)=>[String(r.user_id),r]))
      const funded=byUser(fundedRes.data),waitlist=byUser(waitRes.data),security=byUser(securityRes.data),scale=byUser(scaleRes.data)
      return reply({ok:true,traders:(profiles||[]).map((p:any)=>({
        profile:p,evaluation:latestEval.get(String(p.id))||null,funded:funded.get(String(p.id))||null,
        waitlist:waitlist.get(String(p.id))||null,security:security.get(String(p.id))||null,scale:scale.get(String(p.id))||null
      }))})
    }

    if(ctx.internal&&action==='run_abuse_scan'){
      const {data,error}=await admin.rpc('paper_scan_abuse_v1')
      if(error)throw new Error(error.message)
      return reply({ok:true,result:data})
    }

    if(!ctx.strong)return reply({error:'STRONG_AUTH_REQUIRED',message:'Admin mutations require an AAL2 MFA/passkey session.'},403)

    if(action==='set_emergency_pause'){
      if(!allowed(ctx.role,['owner','admin','ops']))return reply({error:'FORBIDDEN'},403)
      const value=Boolean(body?.enabled)
      const {data:before}=await admin.from('paper_control_plane').select('*').eq('id',true).single()
      const {data:after,error}=await admin.from('paper_control_plane').update({
        emergency_pause:value,
        paper_trading_enabled:value?false:Boolean(body?.paperTradingEnabled??true),
        evaluation_entries_enabled:value?false:Boolean(body?.evaluationEntriesEnabled??true),
        maintenance_message:value?String(body?.message||'PAPER is temporarily paused by operations.'):null,
        updated_at:new Date().toISOString()
      }).eq('id',true).select('*').single()
      if(error)throw new Error(error.message)
      await audit(admin,ctx,'set_emergency_pause','control_plane','global',before,after,requestId)
      return reply({ok:true,control:after})
    }

    if(action==='set_risk_policy'){
      if(!allowed(ctx.role,['owner','admin']))return reply({error:'FORBIDDEN'},403)
      const {data:before}=await admin.from('paper_risk_policy').select('*').eq('id',true).single()
      const patch={
        min_liquidity_usd:finite(body?.minLiquidityUsd,before?.min_liquidity_usd),
        max_top10_holder_pct:finite(body?.maxTop10HolderPct,before?.max_top10_holder_pct),
        max_dev_holder_pct:finite(body?.maxDevHolderPct,before?.max_dev_holder_pct),
        block_freeze_authority:Boolean(body?.blockFreezeAuthority??before?.block_freeze_authority),
        block_mint_authority:Boolean(body?.blockMintAuthority??before?.block_mint_authority),
        max_risk_score:Math.max(1,Math.min(100,Math.round(finite(body?.maxRiskScore,before?.max_risk_score)))),
        updated_at:new Date().toISOString()
      }
      const {data:after,error}=await admin.from('paper_risk_policy').update(patch).eq('id',true).select('*').single()
      if(error)throw new Error(error.message)
      await audit(admin,ctx,'set_risk_policy','risk_policy','global',before,after,requestId)
      return reply({ok:true,riskPolicy:after})
    }

    if(action==='waitlist_update'){
      if(!allowed(ctx.role,['owner','admin','reviewer','ops']))return reply({error:'FORBIDDEN'},403)
      const userId=String(body?.userId||''),status=String(body?.status||'')
      if(!['queued','eligible','held','activated','cancelled'].includes(status))return reply({error:'invalid waitlist status'},400)
      if(status==='activated'){
        const f=await flags(admin)
        if(!allLaunchGatesOpen(f)||!f.real_funded_activation)return reply({error:'REAL_MONEY_GATES_CLOSED'},409)
      }
      const {data:before}=await admin.from('paper_funded_waitlist').select('*').eq('user_id',userId).single()
      const {data:after,error}=await admin.from('paper_funded_waitlist').update({
        status,hold_reason:status==='held'?String(body?.reason||'manual review'):null,
        eligibility_checked_at:new Date().toISOString(),
        activated_at:status==='activated'?new Date().toISOString():before?.activated_at,
        updated_at:new Date().toISOString()
      }).eq('user_id',userId).select('*').single()
      if(error)throw new Error(error.message)
      await audit(admin,ctx,'waitlist_update','user',userId,before,after,requestId)
      return reply({ok:true,waitlist:after})
    }

    if(action==='review_signal'){
      if(!allowed(ctx.role,['owner','admin','reviewer','ops']))return reply({error:'FORBIDDEN'},403)
      const signalId=String(body?.signalId||''),status=String(body?.status||'reviewed')
      if(!['reviewed','dismissed','frozen'].includes(status))return reply({error:'invalid signal status'},400)
      const {data:before}=await admin.from('paper_abuse_signals').select('*').eq('id',signalId).single()
      const {data:after,error}=await admin.from('paper_abuse_signals').update({
        status,reviewed_at:new Date().toISOString(),reviewed_by:ctx.user.id
      }).eq('id',signalId).select('*').single()
      if(error)throw new Error(error.message)
      await audit(admin,ctx,'review_signal','abuse_signal',signalId,before,after,requestId)
      return reply({ok:true,signal:after})
    }

    if(action==='run_abuse_scan'){
      if(!allowed(ctx.role,['owner','admin','reviewer','ops']))return reply({error:'FORBIDDEN'},403)
      const {data,error}=await admin.rpc('paper_scan_abuse_v1')
      if(error)throw new Error(error.message)
      await audit(admin,ctx,'run_abuse_scan','system','abuse',null,data,requestId)
      return reply({ok:true,result:data})
    }

    if(action==='treasury_update'){
      if(!allowed(ctx.role,['owner','admin']))return reply({error:'FORBIDDEN'},403)
      const total=Math.max(0,finite(body?.totalCapitalUsd)),deployed=Math.max(0,finite(body?.deployedCapitalUsd)),
        reserve=Math.max(0,finite(body?.reserveCapitalUsd))
      if(total>0&&(deployed>total*.60+1e-8||reserve<total*.40-1e-8))return reply({error:'TREASURY_POLICY_VIOLATION',message:'Deploy at most 60% and reserve at least 40%.'},422)
      const {data:before}=await admin.from('paper_treasury_state').select('*').eq('id',true).single()
      const {data:after,error}=await admin.from('paper_treasury_state').update({
        total_capital_usd:total,deployed_capital_usd:deployed,reserve_capital_usd:reserve,updated_at:new Date().toISOString()
      }).eq('id',true).select('*').single()
      if(error)throw new Error(error.message)
      await audit(admin,ctx,'treasury_update','treasury','global',before,after,requestId)
      return reply({ok:true,treasury:after})
    }

    if(action==='kyc_decision'){
      if(!allowed(ctx.role,['owner','admin','reviewer']))return reply({error:'FORBIDDEN'},403)
      const f=await flags(admin)
      if(!f.kyc_provider_configured||!f.legal_review_complete)return reply({error:'KYC_GATES_CLOSED'},409)
      const userId=String(body?.userId||'')
      const {data,error}=await admin.rpc('paper_admin_set_kyc_result',{
        target_user:userId,verified:Boolean(body?.verified),
        provider:String(body?.provider||'configured_provider'),
        provider_reference:String(body?.reference||'')||null
      })
      if(error)throw new Error(error.message)
      await audit(admin,ctx,'kyc_decision','user',userId,null,data,requestId)
      return reply({ok:true,result:data})
    }

    if(action==='activate_funded'){
      if(!allowed(ctx.role,['owner','admin']))return reply({error:'FORBIDDEN'},403)
      const f=await flags(admin)
      if(!allLaunchGatesOpen(f)||!f.real_funded_activation)return reply({error:'REAL_MONEY_GATES_CLOSED'},409)
      const userId=String(body?.userId||'')
      const {data,error}=await admin.rpc('paper_admin_activate_funded_account',{
        target_user:userId,trading_wallet:String(body?.tradingWallet||''),
        provider_ref:String(body?.providerRef||''),capital:finite(body?.capitalUsd,1000)
      })
      if(error)throw new Error(error.message)
      await audit(admin,ctx,'activate_funded','user',userId,null,data,requestId)
      return reply({ok:true,result:data})
    }

    if(action==='approve_action'){
      if(!allowed(ctx.role,['owner','admin']))return reply({error:'FORBIDDEN'},403)
      const approvalId=String(body?.approvalId||'')
      const {data:pending,error:pe}=await admin.from('paper_admin_action_approvals').select('*').eq('id',approvalId).eq('status','pending').single()
      if(pe)throw new Error(pe.message)
      if(pending.requested_by===ctx.user.id)return reply({error:'SECOND_ADMIN_REQUIRED'},409)
      const decidedAt=new Date().toISOString()
      const {data:after,error}=await admin.from('paper_admin_action_approvals').update({
        status:'approved',approved_by:ctx.user.id,decided_at:decidedAt
      }).eq('id',approvalId).select('*').single()
      if(error)throw new Error(error.message)
      let settlement=null
      if(pending.action_type==='payout'){
        const {data:s,error:settlementError}=await admin.from('paper_funded_settlements').update({
          status:'approved',approved_by:pending.requested_by,approved_at:pending.requested_at,
          second_approved_by:ctx.user.id,second_approved_at:decidedAt
        }).eq('id',pending.target_id).select('*').single()
        if(settlementError)throw new Error(settlementError.message)
        settlement=s
      }
      await audit(admin,ctx,'approve_action','admin_approval',approvalId,pending,{approval:after,settlement},requestId)
      return reply({ok:true,approval:after,settlement})
    }

    if(action==='approve_payout'){
      if(!allowed(ctx.role,['owner','admin']))return reply({error:'FORBIDDEN'},403)
      const f=await flags(admin)
      if(!allLaunchGatesOpen(f)||!f.real_payouts_enabled)return reply({error:'REAL_PAYOUTS_DISABLED'},409)
      const settlementId=String(body?.settlementId||'')
      const {data:settlement,error:se}=await admin.from('paper_funded_settlements').select('*').eq('id',settlementId).single()
      if(se)throw new Error(se.message)
      const amount=finite(settlement.trader_share_usd)
      if(amount>2000){
        const {data:approved}=await admin.from('paper_admin_action_approvals').select('*')
          .eq('action_type','payout').eq('target_id',settlementId).eq('status','approved').order('decided_at',{ascending:false}).limit(1).maybeSingle()
        if(approved){
          const {data:current}=await admin.from('paper_funded_settlements').select('*').eq('id',settlementId).single()
          return reply({ok:true,settlement:current,approval:approved,signing:'AWAITING_PAYOUT_SIGNER'})
        }
        const {data:pending}=await admin.from('paper_admin_action_approvals').select('*')
          .eq('action_type','payout').eq('target_id',settlementId).eq('status','pending').maybeSingle()
        if(pending)return reply({error:'SECOND_ADMIN_REQUIRED',approval:pending},409)
        const {data:created,error:approvalError}=await admin.from('paper_admin_action_approvals').insert({
          action_type:'payout',target_id:settlementId,amount_usd:amount,requested_by:ctx.user.id,
          details:{settlement_id:settlementId}
        }).select('*').single()
        if(approvalError)throw new Error(approvalError.message)
        return reply({error:'SECOND_ADMIN_REQUIRED',approval:created},409)
      }
      const approvedAt=new Date().toISOString()
      const {data:after,error}=await admin.from('paper_funded_settlements').update({
        status:'approved',approved_by:ctx.user.id,approved_at:approvedAt
      }).eq('id',settlementId).select('*').single()
      if(error)throw new Error(error.message)
      await audit(admin,ctx,'approve_payout','settlement',settlementId,settlement,after,requestId)
      return reply({ok:true,settlement:after,signing:'AWAITING_PAYOUT_SIGNER'})
    }

    return reply({error:'unknown action'},400)
  }catch(error){
    const message=error instanceof Error?error.message:'unknown admin error'
    const status=message==='AUTH_REQUIRED'?401:message==='ADMIN_REQUIRED'?403:500
    return reply({error:message},status)
  }
})
