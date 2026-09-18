import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
})
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')

function envKeys(){
  const url=Deno.env.get('SUPABASE_URL')
  const pubKeys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}')
  const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
  const pub=pubKeys.default||Deno.env.get('SUPABASE_ANON_KEY')
  const secret=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!pub||!secret)throw new Error('server auth configuration missing')
  return{url,pub,secret}
}
async function hmacSha256(secret:string,message:string){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message)))
}
async function sumsubRequest(path:string,method:'GET'|'POST',body?:unknown){
  const appToken=Deno.env.get('SUMSUB_APP_TOKEN'),secret=Deno.env.get('SUMSUB_SECRET_KEY')
  if(!appToken||!secret)throw new Error('SUMSUB_NOT_CONFIGURED')
  const timestamp=Math.floor(Date.now()/1000).toString()
  const rawBody=body===undefined?'':JSON.stringify(body)
  const signature=await hmacSha256(secret,timestamp+method+path+rawBody)
  const r=await fetch('https://api.sumsub.com'+path,{
    method,
    headers:{
      'Accept':'application/json',
      'Content-Type':'application/json',
      'X-App-Token':appToken,
      'X-App-Access-Ts':timestamp,
      'X-App-Access-Sig':signature,
    },
    body:method==='POST'?rawBody:undefined,
  })
  const text=await r.text()
  let parsed:any=null
  try{parsed=text?JSON.parse(text):null}catch{parsed={raw:text.slice(0,500)}}
  if(!r.ok)throw new Error(`SUMSUB_${r.status}:${String(parsed?.description||parsed?.message||'request failed').slice(0,250)}`)
  return parsed
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}})
  if(req.method!=='POST')return reply({error:'method not allowed'},405)
  try{
    const {url,pub,secret}=envKeys()
    const auth=req.headers.get('Authorization')
    if(!auth?.startsWith('Bearer '))return reply({error:'authentication required'},401)
    const userClient=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:{user},error:userError}=await userClient.auth.getUser()
    if(userError||!user||user.is_anonymous)return reply({error:'verified login required'},401)

    const {data:flags,error:flagError}=await admin.from('paper_platform_flags')
      .select('kyc_provider_configured,legal_review_complete,legal_entity_ready').eq('id',true).single()
    if(flagError)throw new Error(flagError.message)
    if(!flags?.kyc_provider_configured)return reply({error:'KYC_PROVIDER_DISABLED',message:'PAPER KYC provider is not configured yet.'},503)

    const {data:profile,error:profileError}=await admin.from('paper_funded_profiles')
      .select('user_id,stage,kyc_status').eq('user_id',user.id).maybeSingle()
    if(profileError)throw new Error(profileError.message)
    if(!profile||!['kyc_required','kyc_pending','compliance_review','approved'].includes(String(profile.stage))){
      return reply({error:'NOT_KYC_ELIGIBLE',message:'Pass the PAPER evaluation before starting funded verification.'},409)
    }
    if(profile.kyc_status==='verified')return reply({ok:true,status:'verified',alreadyVerified:true})

    const levelName=Deno.env.get('SUMSUB_LEVEL_NAME')
    if(!levelName)throw new Error('SUMSUB_LEVEL_NAME missing')
    const externalUserId=`paper:${user.id}`
    const payload:any={userId:externalUserId,levelName,ttlInSecs:600}
    if(user.email)payload.applicantIdentifiers={email:user.email}
    const token=await sumsubRequest('/resources/accessTokens/sdk','POST',payload)
    if(!token?.token)throw new Error('Sumsub access token missing')

    const now=new Date().toISOString()
    const {error:caseError}=await admin.from('paper_kyc_cases').upsert({
      user_id:user.id,provider:'sumsub',external_user_id:externalUserId,level_name:levelName,
      status:'token_issued',updated_at:now,
    },{onConflict:'user_id'})
    if(caseError)throw new Error(caseError.message)

    await admin.from('paper_funded_profiles').update({
      stage:'kyc_pending',kyc_status:'pending',kyc_provider:'sumsub',updated_at:now
    }).eq('user_id',user.id)
    await admin.from('paper_funded_applications').update({
      status:'kyc_pending',updated_at:now
    }).eq('user_id',user.id).in('status',['kyc_required','kyc_pending'])

    return reply({ok:true,provider:'sumsub',accessToken:String(token.token),expiresIn:600,status:'pending'})
  }catch(error){
    const message=error instanceof Error?error.message:'unknown KYC session error'
    const status=message==='SUMSUB_NOT_CONFIGURED'||message==='SUMSUB_LEVEL_NAME missing'?503:500
    return reply({error:message},status)
  }
})
