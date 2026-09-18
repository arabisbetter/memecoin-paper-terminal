import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { Turnkey, DEFAULT_SOLANA_ACCOUNTS } from 'npm:@turnkey/sdk-server@8.4.0'

const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
})
function envKeys(){
  const url=Deno.env.get('SUPABASE_URL')
  const pubKeys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}')
  const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
  const pub=pubKeys.default||Deno.env.get('SUPABASE_ANON_KEY')
  const secret=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!pub||!secret)throw new Error('server auth configuration missing')
  return{url,pub,secret}
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}})
  if(req.method!=='POST')return reply({error:'method not allowed'},405)
  const requestId=crypto.randomUUID()
  let admin:any=null,targetUser=''
  try{
    const {url,pub,secret}=envKeys()
    const auth=req.headers.get('Authorization')
    if(!auth?.startsWith('Bearer '))return reply({error:'authentication required'},401)
    const userClient=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
    admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:{user},error:userError}=await userClient.auth.getUser()
    if(userError||!user)return reply({error:'authentication required'},401)
    const {data:adminRow}=await admin.from('paper_admin_users').select('role,enabled,requires_strong_auth').eq('user_id',user.id).maybeSingle()
    if(!adminRow?.enabled||!['owner','admin'].includes(String(adminRow.role)))return reply({error:'admin access required'},403)
    if(adminRow.requires_strong_auth!==false){
      const {data:aal}=await userClient.auth.mfa.getAuthenticatorAssuranceLevel()
      if(aal?.currentLevel!=='aal2')return reply({error:'STRONG_AUTH_REQUIRED'},403)
    }

    const body=await req.json().catch(()=>({}))
    targetUser=String(body?.userId||'')
    if(!/^[0-9a-f-]{36}$/i.test(targetUser))return reply({error:'valid userId required'},400)

    const [{data:flags},{data:fp},{data:wait},{data:existing}]=await Promise.all([
      admin.from('paper_platform_flags').select('*').eq('id',true).single(),
      admin.from('paper_funded_profiles').select('*').eq('user_id',targetUser).maybeSingle(),
      admin.from('paper_funded_waitlist').select('*').eq('user_id',targetUser).maybeSingle(),
      admin.from('paper_custody_wallets').select('*').eq('user_id',targetUser).maybeSingle(),
    ])
    if(existing?.status==='active'&&existing?.wallet_account_address){
      return reply({ok:true,idempotent:true,walletAddress:existing.wallet_account_address,status:'active'})
    }
    if(!flags?.legal_review_complete||!flags?.legal_entity_ready||!flags?.kyc_provider_configured||
       !flags?.aml_sanctions_controls_ready||!flags?.jurisdiction_allowlist_ready||
       !flags?.turnkey_signing_enabled||!flags?.custody_security_review_complete){
      return reply({error:'CUSTODY_GATES_CLOSED',message:'Legal, KYC/AML, jurisdiction and reviewed Turnkey custody gates must be complete first.'},409)
    }
    if(!fp||fp.kyc_status!=='verified'||fp.aml_status!=='clear'||fp.sanctions_status!=='clear'||
       fp.jurisdiction_status!=='allowed'||fp.age_verified!==true){
      return reply({error:'COMPLIANCE_NOT_READY'},409)
    }
    if(!wait||!['eligible','activated'].includes(String(wait.status)))return reply({error:'WAITLIST_NOT_ELIGIBLE'},409)

    const apiPublicKey=Deno.env.get('TURNKEY_API_PUBLIC_KEY')
    const apiPrivateKey=Deno.env.get('TURNKEY_API_PRIVATE_KEY')
    const organizationId=Deno.env.get('TURNKEY_ORGANIZATION_ID')
    const policyRef=Deno.env.get('TURNKEY_POLICY_ID')
    if(!apiPublicKey||!apiPrivateKey||!organizationId||!policyRef){
      return reply({error:'TURNKEY_NOT_CONFIGURED',message:'Reviewed Turnkey API keys, organization and policy ID are required.'},503)
    }

    await admin.from('paper_custody_wallets').upsert({
      user_id:targetUser,provider:'turnkey',organization_id:organizationId,policy_ref:policyRef,
      status:'provisioning',key_export_allowed:false,arbitrary_transfer_allowed:false,
      principal_withdrawal_allowed:false,updated_at:new Date().toISOString()
    },{onConflict:'user_id'})

    const turnkey=new Turnkey({
      apiBaseUrl:'https://api.turnkey.com',
      apiPublicKey,apiPrivateKey,defaultOrganizationId:organizationId
    })
    const {walletId,addresses}=await turnkey.apiClient().createWallet({
      walletName:`PAPER-funded-${targetUser.slice(0,8)}`,
      accounts:DEFAULT_SOLANA_ACCOUNTS
    })
    const walletAddress=addresses?.[0]
    if(!walletId||!walletAddress)throw new Error('Turnkey wallet response missing id/address')

    const now=new Date().toISOString()
    const {data:saved,error:saveError}=await admin.from('paper_custody_wallets').update({
      wallet_id:String(walletId),wallet_account_address:String(walletAddress),policy_ref:policyRef,
      status:'active',provisioned_at:now,last_error:null,updated_at:now
    }).eq('user_id',targetUser).select('id,user_id,wallet_id,wallet_account_address,status,policy_ref,provisioned_at').single()
    if(saveError)throw new Error(saveError.message)

    await admin.from('paper_admin_audit_log').insert({
      actor_user_id:user.id,actor_role:adminRow.role,action:'provision_turnkey_custody',
      target_type:'user',target_id:targetUser,before_state:existing||null,
      after_state:{custody_wallet_id:saved.id,wallet_address:saved.wallet_account_address,status:saved.status,policy_ref:saved.policy_ref},
      request_id:requestId
    })

    return reply({ok:true,walletAddress:saved.wallet_account_address,status:saved.status,policyRef:saved.policy_ref})
  }catch(error){
    const message=error instanceof Error?error.message:'custody provisioning failed'
    if(admin&&targetUser)await admin.from('paper_custody_wallets').update({status:'error',last_error:message.slice(0,500),updated_at:new Date().toISOString()}).eq('user_id',targetUser)
    return reply({error:message},500)
  }
})
