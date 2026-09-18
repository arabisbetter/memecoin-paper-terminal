import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import bs58 from 'npm:bs58@6.0.0'
import nacl from 'npm:tweetnacl@1.0.3'

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
function validAddress(address:string){
  try{return bs58.decode(address).length===32}catch{return false}
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
    const body=await req.json().catch(()=>({}))
    const action=String(body?.action||''),walletAddress=String(body?.walletAddress||'').trim()
    if(!validAddress(walletAddress))return reply({error:'invalid Solana wallet address'},400)

    if(action==='challenge'){
      const nonce=crypto.randomUUID(),expiresAt=new Date(Date.now()+10*60_000).toISOString()
      const message=[
        'PAPER payout wallet verification',
        `User: ${user.id}`,
        `Wallet: ${walletAddress}`,
        `Nonce: ${nonce}`,
        `Expires: ${expiresAt}`,
        'This signature proves wallet control only. It does not authorize trading or transfers.'
      ].join('\n')
      const {error}=await admin.from('payout_wallet_challenges').insert({
        user_id:user.id,nonce,message,expires_at:expiresAt
      })
      if(error)throw new Error(error.message)
      return reply({ok:true,nonce,message,expiresAt})
    }

    if(action==='verify'){
      const nonce=String(body?.nonce||''),signature=String(body?.signature||'')
      if(!nonce||!signature)return reply({error:'nonce and signature required'},400)
      const {data:challenge,error:challengeError}=await admin.from('payout_wallet_challenges')
        .select('id,user_id,nonce,message,expires_at,used_at').eq('user_id',user.id).eq('nonce',nonce).maybeSingle()
      if(challengeError)throw new Error(challengeError.message)
      if(!challenge||challenge.used_at)return reply({error:'challenge unavailable or already used'},409)
      if(new Date(challenge.expires_at).getTime()<=Date.now())return reply({error:'challenge expired'},409)
      if(!String(challenge.message).includes(`Wallet: ${walletAddress}`))return reply({error:'wallet does not match challenge'},409)

      let verified=false
      try{
        const pubkey=bs58.decode(walletAddress),sig=bs58.decode(signature)
        verified=sig.length===64&&nacl.sign.detached.verify(new TextEncoder().encode(challenge.message),sig,pubkey)
      }catch{verified=false}
      if(!verified)return reply({error:'signature verification failed'},400)

      const {data:used,error:useError}=await admin.from('payout_wallet_challenges')
        .update({used_at:new Date().toISOString()}).eq('id',challenge.id).is('used_at',null).select('id').maybeSingle()
      if(useError)throw new Error(useError.message)
      if(!used)return reply({error:'challenge already consumed'},409)

      const [{data:dupProfile},{data:dupSecurity}]=await Promise.all([
        admin.from('paper_funded_profiles').select('user_id').eq('payout_wallet_address',walletAddress).neq('user_id',user.id).limit(1).maybeSingle(),
        admin.from('account_security').select('user_id').eq('payout_wallet_address',walletAddress).neq('user_id',user.id).limit(1).maybeSingle(),
      ])
      const other=dupProfile?.user_id||dupSecurity?.user_id||null
      if(other){
        await admin.from('paper_abuse_signals').insert({
          user_id:user.id,related_user_id:other,signal_type:'duplicate_payout_wallet',
          severity:'hard',status:'frozen',details:{wallet:walletAddress,signature_verified:true}
        }).then(()=>{}).catch(()=>{})
        await admin.from('paper_funded_profiles').update({stage:'suspended',updated_at:new Date().toISOString()}).in('user_id',[user.id,other])
        return reply({error:'DUPLICATE_PAYOUT_WALLET_REVIEW'},409)
      }

      const now=new Date().toISOString()
      const {error:securityError}=await admin.from('account_security').upsert({
        user_id:user.id,payout_wallet_address:walletAddress,payout_linked_at:now,updated_at:now
      },{onConflict:'user_id'})
      if(securityError)throw new Error(securityError.message)
      const {error:profileError}=await admin.from('paper_funded_profiles').update({
        payout_wallet_address:walletAddress,payout_wallet_verified_at:now,updated_at:now
      }).eq('user_id',user.id)
      if(profileError)throw new Error(profileError.message)

      return reply({ok:true,walletAddress,verifiedAt:now})
    }

    return reply({error:'unknown action'},400)
  }catch(error){
    return reply({error:error instanceof Error?error.message:'wallet verification failed'},500)
  }
})
