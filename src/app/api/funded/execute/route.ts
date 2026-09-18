import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Turnkey } from '@turnkey/sdk-server'
import { TurnkeySigner } from '@turnkey/solana'
import { VersionedTransaction } from '@solana/web3.js'

export const runtime='nodejs'

const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const WSOL='So11111111111111111111111111111111111111112'
const isMint=(s:string)=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)
const finite=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback}
const out=(body:unknown,status=200)=>NextResponse.json(body,{status})

function serverConfig(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!pub||!secret)throw new Error('server auth configuration missing')
  return{url,pub,secret}
}
function rpcUrl(){
  if(process.env.SOLANA_RPC_URL)return process.env.SOLANA_RPC_URL
  if(process.env.HELIUS_API_KEY)return 'https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(process.env.HELIUS_API_KEY)
  throw new Error('SOLANA_RPC_NOT_CONFIGURED')
}
async function rpc(method:string,params:unknown[]){
  const r=await fetch(rpcUrl(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),cache:'no-store'})
  const body=await r.json()
  if(!r.ok||body?.error)throw new Error(body?.error?.message||'RPC_'+r.status)
  return body?.result
}
async function decimals(mint:string){
  const result=await rpc('getTokenSupply',[mint,{commitment:'confirmed'}])
  const d=Number(result?.value?.decimals)
  if(!Number.isInteger(d)||d<0||d>18)throw new Error('TOKEN_DECIMALS_UNAVAILABLE')
  return d
}
async function actualFeeLamports(signature:string){
  try{
    const tx=await rpc('getTransaction',[signature,{commitment:'confirmed',maxSupportedTransactionVersion:0,encoding:'json'}])
    const fee=Number(tx?.meta?.fee)
    return Number.isFinite(fee)&&fee>=0?Math.round(fee):0
  }catch{return 0}
}
async function solUsd(){
  try{
    const r=await fetch('https://api.dexscreener.com/tokens/v1/solana/'+WSOL,{headers:{Accept:'application/json'},cache:'no-store'})
    if(!r.ok)return 0
    const rows=await r.json()
    const candidates=(Array.isArray(rows)?rows:[]).filter((x:any)=>String(x?.baseToken?.address||'')===WSOL&&finite(x?.priceUsd)>0)
    candidates.sort((a:any,b:any)=>finite(b?.liquidity?.usd)-finite(a?.liquidity?.usd))
    return finite(candidates[0]?.priceUsd)
  }catch{return 0}
}
async function refreshRisk(url:string,auth:string,mint:string){
  const r=await fetch(url+'/functions/v1/market-risk-scan',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':auth},body:JSON.stringify({mint}),cache:'no-store'
  })
  const body=await r.json().catch(()=>({}))
  if(!r.ok||body?.error)throw new Error(body?.error||'RISK_SCAN_UNAVAILABLE')
  if(body?.dataStatus!=='LIVE')throw new Error('FRESH_CHAIN_RISK_DATA_REQUIRED')
  if(body?.fundedBuyBlocked)throw new Error('TOKEN_RISK_BLOCK')
}
async function orderQuote(params:{inputMint:string;outputMint:string;amount:string;taker:string;slippageBps:number}){
  const key=process.env.JUPITER_API_KEY
  if(!key)throw new Error('JUPITER_API_KEY_NOT_CONFIGURED')
  const u=new URL('https://api.jup.ag/swap/v2/order')
  u.searchParams.set('inputMint',params.inputMint);u.searchParams.set('outputMint',params.outputMint)
  u.searchParams.set('amount',params.amount);u.searchParams.set('taker',params.taker)
  u.searchParams.set('slippageBps',String(params.slippageBps))
  u.searchParams.set('excludeRouters','jupiterz,dflow,okx')
  const r=await fetch(u,{headers:{Accept:'application/json','x-api-key':key},cache:'no-store'})
  const body=await r.json().catch(()=>({}))
  if(!r.ok||body?.errorCode||!body?.transaction||!body?.requestId)throw new Error(body?.errorMessage||body?.error||'JUPITER_ORDER_'+r.status)
  return body
}
function routeLabels(order:any){
  return [...new Set((Array.isArray(order?.routePlan)?order.routePlan:[]).map((x:any)=>String(x?.swapInfo?.label||x?.label||'').trim()).filter(Boolean))] as string[]
}
function assertPumpOnly(labels:string[]){
  if(!labels.length)throw new Error('ROUTE_LABELS_UNAVAILABLE')
  if(labels.some(label=>!/pump/i.test(label)))throw new Error('VENUE_NOT_ALLOWED')
}
async function executeJupiter(signedTransaction:string,requestId:string,lastValidBlockHeight:unknown){
  const key=process.env.JUPITER_API_KEY
  if(!key)throw new Error('JUPITER_API_KEY_NOT_CONFIGURED')
  const r=await fetch('https://api.jup.ag/swap/v2/execute',{
    method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','x-api-key':key},
    body:JSON.stringify({signedTransaction,requestId,lastValidBlockHeight}),cache:'no-store'
  })
  const body=await r.json().catch(()=>({}))
  if(!r.ok||String(body?.status||'').toLowerCase()!=='success'||!body?.signature)throw new Error(body?.error||body?.errorMessage||body?.code||'JUPITER_EXECUTE_'+r.status)
  return body
}
function signerConfig(){
  const apiPublicKey=process.env.TURNKEY_API_PUBLIC_KEY,apiPrivateKey=process.env.TURNKEY_API_PRIVATE_KEY
  const organizationId=process.env.TURNKEY_ORGANIZATION_ID,policyId=process.env.TURNKEY_POLICY_ID
  if(!apiPublicKey||!apiPrivateKey||!organizationId||!policyId)throw new Error('TURNKEY_NOT_CONFIGURED')
  const turnkey=new Turnkey({apiBaseUrl:'https://api.turnkey.com',apiPublicKey,apiPrivateKey,defaultOrganizationId:organizationId})
  return{organizationId,policyId,signer:new TurnkeySigner({organizationId,client:turnkey.apiClient()})}
}
function atomicAmount(value:number,decimals:number){
  if(!Number.isFinite(value)||value<=0)throw new Error('INVALID_AMOUNT')
  const scaled=Math.floor(value*10**decimals)
  if(!Number.isSafeInteger(scaled)||scaled<=0)throw new Error('AMOUNT_PRECISION_UNSUPPORTED')
  return String(scaled)
}

export async function POST(req:NextRequest){
  if(process.env.PAPER_REAL_MONEY_SERVER_ENABLED!=='true')return out({error:'REAL_MONEY_SERVER_DISABLED'},503)
  let admin:any=null,userId='',orderId=''
  try{
    const {url,pub,secret}=serverConfig(),auth=req.headers.get('authorization')
    if(!auth?.startsWith('Bearer '))return out({error:'authentication required'},401)
    const userClient=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
    admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:{user},error:userError}=await userClient.auth.getUser()
    if(userError||!user||user.is_anonymous)return out({error:'verified login required'},401)
    userId=user.id

    const body=await req.json().catch(()=>({}))
    const mint=String(body?.mint||'').trim(),side=String(body?.side||'').toLowerCase(),idempotencyKey=String(body?.idempotencyKey||'').trim()
    const slippageBps=Math.round(finite(body?.slippageBps,300))
    if(!isMint(mint))return out({error:'invalid Solana mint'},400)
    if(!['buy','sell'].includes(side))return out({error:'side must be buy or sell'},400)
    if(!idempotencyKey||idempotencyKey.length>128)return out({error:'idempotencyKey required'},400)
    if(slippageBps<1||slippageBps>500)return out({error:'slippage must be between 1 and 500 bps'},400)

    const {data:existing}=await admin.from('paper_funded_orders').select('*').eq('user_id',userId).eq('idempotency_key',idempotencyKey).maybeSingle()
    if(existing)return out({ok:existing.status==='confirmed',idempotent:true,orderId:existing.id,status:existing.status,txSignature:existing.tx_signature||null,rejectionReason:existing.rejection_reason||existing.last_error||null})

    const {data:account,error:accountError}=await admin.from('paper_funded_accounts').select('*').eq('user_id',userId).maybeSingle()
    if(accountError)throw new Error(accountError.message)
    if(!account||account.status!=='active')return out({error:'FUNDED_ACCOUNT_NOT_ACTIVE'},409)
    const {data:custody,error:custodyError}=await admin.from('paper_custody_wallets').select('*').eq('user_id',userId).maybeSingle()
    if(custodyError)throw new Error(custodyError.message)
    if(custody?.status!=='active'||!custody?.wallet_account_address)return out({error:'CUSTODY_WALLET_NOT_ACTIVE'},409)

    let notionalUsd=finite(body?.notionalUsd),sellPct=finite(body?.sellPct,100),sellQty=0,tokenDecimals=6
    if(side==='buy'){
      if(notionalUsd<=0)return out({error:'notionalUsd required for buy'},400)
      await refreshRisk(url,auth,mint)
    }else{
      if(sellPct<=0||sellPct>100)return out({error:'sellPct must be >0 and <=100'},400)
      const {data:position,error:positionError}=await admin.from('paper_funded_positions').select('*').eq('funded_account_id',account.id).eq('token_address',mint).eq('status','open').maybeSingle()
      if(positionError)throw new Error(positionError.message)
      if(!position||finite(position.quantity_tokens)<=0)return out({error:'NO_OPEN_FUNDED_POSITION'},409)
      sellQty=finite(position.quantity_tokens)*(sellPct/100)
      const {data:mark}=await admin.from('paper_market_marks').select('price_usd,data_status,observed_at').eq('mint_address',mint).maybeSingle()
      if(!mark||mark.data_status!=='LIVE'||new Date(mark.observed_at).getTime()<Date.now()-90_000)return out({error:'FRESH_MARK_REQUIRED'},409)
      notionalUsd=sellQty*finite(mark.price_usd)
    }

    const {data:preflight,error:preflightError}=await admin.rpc('paper_funded_preflight_v1',{
      p_user_id:userId,p_token_address:mint,p_side:side,p_notional_usd:notionalUsd,p_slippage_bps:slippageBps
    })
    if(preflightError)return out({error:preflightError.message},409)

    const {policyId,organizationId,signer}=signerConfig()
    if(custody.policy_ref!==policyId)return out({error:'CUSTODY_POLICY_MISMATCH'},409)
    if(String(custody.organization_id||'')!==organizationId)return out({error:'CUSTODY_ORGANIZATION_MISMATCH'},409)

    tokenDecimals=side==='buy'?6:await decimals(mint)
    const inputMint=side==='buy'?USDC:mint,outputMint=side==='buy'?mint:USDC
    const amount=side==='buy'?atomicAmount(notionalUsd,6):atomicAmount(sellQty,tokenDecimals)
    const order=await orderQuote({inputMint,outputMint,amount,taker:custody.wallet_account_address,slippageBps})
    const labels=routeLabels(order);assertPumpOnly(labels)

    const {data:created,error:createError}=await admin.from('paper_funded_orders').insert({
      funded_account_id:account.id,user_id:userId,token_chain:'solana',token_address:mint,side,
      requested_notional_usd:notionalUsd,status:'quoted',idempotency_key:idempotencyKey,input_mint:inputMint,output_mint:outputMint,
      slippage_bps:slippageBps,protocol_fee_bps:Number(preflight?.protocol_fee_bps||100),quote_provider:'jupiter_v2',
      route_labels:labels,price_impact_pct:finite(order?.priceImpactPct),expected_out_amount_atomic:String(order?.outAmount||order?.outputAmount||''),
      quote_snapshot:{router:order?.router||'metis',requestId:String(order.requestId),routePlan:(order?.routePlan||[]).map((x:any)=>({label:x?.swapInfo?.label||x?.label||null,percent:x?.percent||null}))},
      quote_expires_at:new Date(Date.now()+30_000).toISOString()
    }).select('id').single()
    if(createError)throw new Error(createError.message)
    orderId=created.id

    const tx=VersionedTransaction.deserialize(Buffer.from(String(order.transaction),'base64'))
    const signed=await signer.signTransaction(tx,custody.wallet_account_address,organizationId) as VersionedTransaction
    const signedB64=Buffer.from(signed.serialize()).toString('base64')
    await admin.from('paper_funded_orders').update({status:'signed',signed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',orderId)
    await admin.from('paper_funded_execution_events').insert({order_id:orderId,funded_account_id:account.id,user_id:userId,event_type:'signed',provider:'turnkey',details:{policyRef:policyId,routeLabels:labels}})

    const executed=await executeJupiter(signedB64,String(order.requestId),order.lastValidBlockHeight)
    const signature=String(executed.signature),slot=Math.round(finite(executed.slot))
    await admin.from('paper_funded_orders').update({status:'broadcast',tx_signature:signature,broadcast_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',orderId)

    const inputAtomic=BigInt(String(executed.inputAmountResult||executed.totalInputAmount||amount))
    const outputAtomic=BigInt(String(executed.outputAmountResult||executed.totalOutputAmount||order.outAmount||'0'))
    const qty=side==='buy'?Number(outputAtomic)/10**(await decimals(mint)):Number(inputAtomic)/10**tokenDecimals
    const usd=side==='buy'?Number(inputAtomic)/1e6:Number(outputAtomic)/1e6
    if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(usd)||usd<=0)throw new Error('CONFIRMED_AMOUNT_UNAVAILABLE')
    const fillPrice=usd/qty,feeLamports=await actualFeeLamports(signature),solPrice=feeLamports>0?await solUsd():0
    const networkFeeUsd=feeLamports>0&&solPrice>0?(feeLamports/1e9)*solPrice:0

    const {data:fill,error:fillError}=await admin.rpc('paper_record_funded_fill_v1',{
      p_order_id:orderId,p_quantity_tokens:qty,p_fill_price_usd:fillPrice,p_notional_usd:usd,
      p_network_fee_usd:networkFeeUsd,p_tx_signature:signature,p_confirmation_slot:slot
    })
    if(fillError)throw new Error(fillError.message)
    await admin.from('paper_funded_orders').update({actual_out_amount_atomic:String(outputAtomic),network_fee_lamports:feeLamports,updated_at:new Date().toISOString()}).eq('id',orderId)

    return out({ok:true,orderId,status:'confirmed',txSignature:signature,slot,side,mint,quantityTokens:qty,notionalUsd:usd,fillPriceUsd:fillPrice,protocolFeeUsd:finite(fill?.protocol_fee_usd),networkFeeUsd,routeLabels:labels})
  }catch(error){
    const message=error instanceof Error?error.message:'funded execution failed'
    if(admin&&orderId)await admin.from('paper_funded_orders').update({status:'rejected',rejection_reason:message.slice(0,500),last_error:message.slice(0,500),updated_at:new Date().toISOString()}).eq('id',orderId)
    return out({error:message},409)
  }
}
