import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
const bytesToHex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')
const safeText=(v:unknown,max=250)=>String(v??'').slice(0,max)
const hasRiskLabel=(labels:string[],needle:string)=>labels.some(x=>x.toUpperCase().includes(needle))

function envKeys(){
  const url=Deno.env.get('SUPABASE_URL')
  const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
  const secret=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!secret)throw new Error('server auth configuration missing')
  return{url,secret}
}
async function hmac(secret:string,raw:string,algorithm:'SHA-1'|'SHA-256'|'SHA-512'){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:algorithm},false,['sign'])
  return bytesToHex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw)))
}
async function verifyWebhook(req:Request,raw:string){
  const secret=Deno.env.get('SUMSUB_WEBHOOK_SECRET')
  if(!secret)throw new Error('SUMSUB_WEBHOOK_SECRET missing')
  const supplied=(req.headers.get('x-payload-digest')||'').toLowerCase()
  const algHeader=req.headers.get('x-payload-digest-alg')||''
  const map:Record<string,'SHA-1'|'SHA-256'|'SHA-512'>={
    HMAC_SHA1_HEX:'SHA-1',HMAC_SHA256_HEX:'SHA-256',HMAC_SHA512_HEX:'SHA-512'
  }
  const alg=map[algHeader]
  if(!supplied||!alg)return false
  const expected=(await hmac(secret,raw,alg)).toLowerCase()
  if(expected.length!==supplied.length)return false
  let diff=0
  for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^supplied.charCodeAt(i)
  return diff===0
}
async function sumsubApi(path:string,method:'GET'|'POST',body?:unknown){
  const token=Deno.env.get('SUMSUB_APP_TOKEN'),secret=Deno.env.get('SUMSUB_SECRET_KEY')
  if(!token||!secret)throw new Error('SUMSUB_NOT_CONFIGURED')
  const ts=Math.floor(Date.now()/1000).toString(),raw=body===undefined?'':JSON.stringify(body)
  const sig=await hmac(secret,ts+method+path+raw,'SHA-256')
  const r=await fetch('https://api.sumsub.com'+path,{
    method,headers:{Accept:'application/json','Content-Type':'application/json','X-App-Token':token,'X-App-Access-Ts':ts,'X-App-Access-Sig':sig},
    body:method==='POST'?raw:undefined
  })
  const text=await r.text()
  let parsed:any=null
  try{parsed=text?JSON.parse(text):null}catch{parsed=null}
  if(!r.ok)throw new Error(`SUMSUB_${r.status}:${safeText(parsed?.description||parsed?.message||'request failed')}`)
  return parsed
}
function age18(dob?:string){
  if(!dob)return null
  const birth=new Date(dob+'T00:00:00Z')
  if(Number.isNaN(birth.getTime()))return null
  const today=new Date(),threshold=new Date(Date.UTC(today.getUTCFullYear()-18,today.getUTCMonth(),today.getUTCDate()))
  return birth<=threshold
}
async function jurisdiction(admin:any,country:string|null,region:string|null){
  if(!country)return{status:'review',rule:null}
  const now=new Date().toISOString()
  const {data}=await admin.from('paper_jurisdiction_rules').select('*')
    .eq('country_code',country).eq('approved_by_counsel',true)
    .lte('effective_at',now).or(`expires_at.is.null,expires_at.gt.${now}`)
  const rules=(data||[]) as any[]
  const exact=region?rules.find(r=>String(r.region_code||'').toUpperCase()===region.toUpperCase()):null
  const fallback=rules.find(r=>!r.region_code)
  const rule=exact||fallback||null
  return{status:rule?.real_funded_allowed?'allowed':'blocked',rule}
}
async function applicantFacts(externalUserId:string){
  try{
    const data=await sumsubApi('/resources/applicants/-;externalUserId='+encodeURIComponent(externalUserId)+'/one','GET')
    const info=data?.info||{}
    return{
      applicantId:data?.id?String(data.id):null,
      country:info?.country?String(info.country).toUpperCase():null,
      region:info?.state?String(info.state).toUpperCase():null,
      ageVerified:age18(info?.dob?String(info.dob):undefined)
    }
  }catch{return{applicantId:null,country:null,region:null,ageVerified:null}}
}
async function runAmlRecheck(applicantId:string){
  if(Deno.env.get('SUMSUB_AUTO_AML_RECHECK')!=='true')return false
  try{await sumsubApi('/resources/applicants/'+encodeURIComponent(applicantId)+'/recheck/aml','POST',{});return true}catch{return false}
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return new Response('method not allowed',{status:405})
  try{
    const raw=await req.text()
    if(!await verifyWebhook(req,raw))return new Response('bad signature',{status:401})
    const body=JSON.parse(raw)
    const eventType=safeText(body?.type,80),correlationId=safeText(body?.correlationId,160)
    const applicantId=safeText(body?.applicantId,120),externalUserId=safeText(body?.externalUserId,160)
    const reviewStatus=safeText(body?.reviewStatus,80),reviewMode=safeText(body?.reviewMode,80)
    const reviewAnswer=safeText(body?.reviewResult?.reviewAnswer,20)
    const rejectType=safeText(body?.reviewResult?.reviewRejectType,20)
    const labels=Array.isArray(body?.reviewResult?.rejectLabels)?body.reviewResult.rejectLabels.map((x:unknown)=>safeText(x,80)):[]
    if(!externalUserId.startsWith('paper:'))return json({ok:true,ignored:true})
    const userId=externalUserId.slice(6)
    const {url,secret}=envKeys()
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})

    const now=new Date().toISOString()
    const {data:existing}=await admin.from('paper_kyc_cases').select('*').eq('user_id',userId).maybeSingle()
    const sanitized={
      levelName:safeText(body?.levelName,120)||null,sandboxMode:Boolean(body?.sandboxMode),
      reviewMode:reviewMode||null,rejectLabels:labels.slice(0,25)
    }
    const eventInsert=await admin.from('paper_kyc_events').upsert({
      user_id:userId,applicant_id:applicantId||existing?.applicant_id||null,provider:'sumsub',
      event_type:eventType,review_status:reviewStatus||null,review_answer:reviewAnswer||null,
      correlation_id:correlationId||crypto.randomUUID(),verified_signature:true,payload_summary:sanitized,received_at:now
    },{onConflict:'provider,correlation_id,event_type',ignoreDuplicates:true})
    if(eventInsert.error)throw new Error(eventInsert.error.message)

    let kycStatus=String(existing?.status||'pending'),profileKyc=String(existing?.status==='approved'?'verified':'pending')
    let aml=String(existing?.aml_status||'not_checked'),sanctions=String(existing?.sanctions_status||'not_checked')
    let stage='kyc_pending',approvedAt:string|null=existing?.approved_at||null,rejectedAt:string|null=existing?.rejected_at||null
    let facts={applicantId:null as string|null,country:null as string|null,region:null as string|null,ageVerified:null as boolean|null}
    let jurisdictionStatus='not_checked'

    if(eventType==='applicantReviewed'||eventType==='applicantWorkflowCompleted'){
      if(reviewMode==='ongoingAml'){
        if(reviewAnswer==='GREEN'){aml='clear';sanctions='clear';stage='compliance_review'}
        else if(reviewAnswer==='RED'){aml='blocked';sanctions=hasRiskLabel(labels,'SANCTION')?'blocked':'review';stage='suspended'}
      }else if(reviewAnswer==='GREEN'){
        kycStatus='approved';profileKyc='verified';approvedAt=now;aml='pending';sanctions='pending';stage='compliance_review'
        facts=await applicantFacts(externalUserId)
        const j=await jurisdiction(admin,facts.country,facts.region);jurisdictionStatus=j.status
        const recheckStarted=applicantId?await runAmlRecheck(applicantId):false
        if(!recheckStarted){aml='review';sanctions='review'}
        await admin.from('paper_compliance_checks').insert([
          {user_id:userId,check_type:'kyc',status:'clear',provider:'sumsub',provider_reference:applicantId||null,details:{reviewAnswer:'GREEN'}},
          {user_id:userId,check_type:'age',status:facts.ageVerified===true?'clear':'review',provider:'sumsub',provider_reference:applicantId||null,details:{derivedOnly:true}},
          {user_id:userId,check_type:'jurisdiction',status:j.status==='allowed'?'clear':j.status==='blocked'?'blocked':'review',provider:'sumsub',provider_reference:applicantId||null,details:{country:facts.country,region:facts.region}}
        ])
      }else if(reviewAnswer==='RED'){
        if(rejectType==='RETRY'){kycStatus='resubmission_requested';profileKyc='pending';stage='kyc_pending'}
        else{kycStatus='rejected';profileKyc='rejected';rejectedAt=now;stage='rejected'}
        if(hasRiskLabel(labels,'SANCTION'))sanctions='blocked'
        if(hasRiskLabel(labels,'PEP')||hasRiskLabel(labels,'ADVERSE'))aml='review'
        if(labels.some((x:string)=>/DUPLICATE|BLOCKLIST|COMPROMISED/i.test(x))){
          await admin.from('paper_compliance_checks').insert({user_id:userId,check_type:'duplicate_identity',status:'blocked',provider:'sumsub',provider_reference:applicantId||null,details:{labels}})
        }
      }
    }else if(eventType==='applicantOnHold'){
      if(reviewMode==='ongoingAml'){aml='review';sanctions='review';stage='suspended'}
      else{kycStatus='on_hold';profileKyc='pending';stage='compliance_review'}
    }else if(eventType==='applicantPending'){
      if(reviewMode==='ongoingAml'){aml='pending';sanctions='pending'}
      else{kycStatus='pending';profileKyc='pending'}
    }

    if(facts.country==null&&existing?.country_code)facts.country=existing.country_code
    if(facts.ageVerified==null&&existing?.age_verified!=null)facts.ageVerified=Boolean(existing.age_verified)
    if(jurisdictionStatus==='not_checked'){
      const {data:fp}=await admin.from('paper_funded_profiles').select('jurisdiction_status').eq('user_id',userId).maybeSingle()
      jurisdictionStatus=String(fp?.jurisdiction_status||'not_checked')
    }

    const caseUpsert=await admin.from('paper_kyc_cases').upsert({
      user_id:userId,provider:'sumsub',applicant_id:applicantId||existing?.applicant_id||null,
      external_user_id:externalUserId,level_name:safeText(body?.levelName,120)||existing?.level_name||null,
      status:kycStatus,review_answer:reviewAnswer||existing?.review_answer||null,
      review_reject_type:rejectType||null,reject_labels:labels,
      country_code:facts.country||existing?.country_code||null,age_verified:facts.ageVerified??existing?.age_verified??null,
      aml_status:aml,sanctions_status:sanctions,provider_correlation_id:correlationId||null,
      last_webhook_at:now,approved_at:approvedAt,rejected_at:rejectedAt,
      last_aml_check_at:reviewMode==='ongoingAml'?now:existing?.last_aml_check_at||null,updated_at:now
    },{onConflict:'user_id'})
    if(caseUpsert.error)throw new Error(caseUpsert.error.message)

    const fpPatch:any={
      stage,kyc_status:profileKyc,kyc_provider:'sumsub',kyc_reference:applicantId||existing?.applicant_id||null,
      kyc_verified_at:profileKyc==='verified'?approvedAt:null,
      aml_status:aml==='pending'?'review':aml,sanctions_status:sanctions==='pending'?'review':sanctions,
      jurisdiction_country_code:facts.country||undefined,jurisdiction_region_code:facts.region||undefined,
      jurisdiction_status:jurisdictionStatus,
      age_verified:facts.ageVerified===true,
      compliance_checked_at:now,updated_at:now
    }
    const {error:fpError}=await admin.from('paper_funded_profiles').update(fpPatch).eq('user_id',userId)
    if(fpError)throw new Error(fpError.message)

    if(reviewMode==='ongoingAml'){
      await admin.from('paper_compliance_checks').insert([
        {user_id:userId,check_type:'aml',status:aml==='clear'?'clear':aml==='blocked'?'blocked':'review',provider:'sumsub',provider_reference:applicantId||null,details:{reviewMode}},
        {user_id:userId,check_type:'sanctions',status:sanctions==='clear'?'clear':sanctions==='blocked'?'blocked':'review',provider:'sumsub',provider_reference:applicantId||null,details:{reviewMode,labels}}
      ])
    }

    return json({ok:true})
  }catch(error){
    return json({error:error instanceof Error?error.message:'unknown webhook error'},500)
  }
})
