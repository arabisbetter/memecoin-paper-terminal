import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { Turnkey } from '@turnkey/sdk-server'
import { TurnkeySigner } from '@turnkey/solana'
import bs58 from 'bs58'
import { consumeServerRateLimit, validateActiveSession } from '@/lib/server/security'

export const runtime='nodejs'

const DEFAULT_USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const WSOL='So11111111111111111111111111111111111111112'
const MEMO_PROGRAM=new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
const out=(body:unknown,status=200)=>NextResponse.json(body,{status})
const finite=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback}

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
function payoutSigner(){
  const apiPublicKey=process.env.TURNKEY_API_PUBLIC_KEY
  const apiPrivateKey=process.env.TURNKEY_API_PRIVATE_KEY
  const organizationId=process.env.TURNKEY_PAYOUT_ORGANIZATION_ID||process.env.TURNKEY_ORGANIZATION_ID
  const policyId=process.env.TURNKEY_PAYOUT_POLICY_ID
  const walletAddress=process.env.TURNKEY_PAYOUT_WALLET_ADDRESS
  if(!apiPublicKey||!apiPrivateKey||!organizationId||!policyId||!walletAddress){
    throw new Error('PAYOUT_TURNKEY_NOT_CONFIGURED')
  }
  const wallet=new PublicKey(walletAddress)
  const turnkey=new Turnkey({apiBaseUrl:'https://api.turnkey.com',apiPublicKey,apiPrivateKey,defaultOrganizationId:organizationId})
  return{organizationId,policyId,wallet,signer:new TurnkeySigner({organizationId,client:turnkey.apiClient()})}
}
function launchGatesOpen(f:any){
  return Boolean(
    f?.legal_review_complete&&f?.legal_entity_ready&&f?.kyc_provider_configured&&
    f?.aml_sanctions_controls_ready&&f?.jurisdiction_allowlist_ready&&
    f?.custody_security_review_complete&&f?.turnkey_signing_enabled&&
    f?.treasury_capital_available&&f?.real_funded_activation&&f?.real_payouts_enabled
  )
}
async function freshSolUsd(admin:any){
  const {data:mark}=await admin.from('paper_market_marks')
    .select('price_usd,data_status,observed_at').eq('mint_address',WSOL).maybeSingle()
  if(mark?.data_status==='LIVE'&&finite(mark?.price_usd)>0&&new Date(mark.observed_at).getTime()>Date.now()-90_000){
    return finite(mark.price_usd)
  }
  const r=await fetch('https://api.dexscreener.com/tokens/v1/solana/'+WSOL,{headers:{Accept:'application/json'},cache:'no-store'})
  if(!r.ok)throw new Error('SOL_PRICE_UNAVAILABLE')
  const rows=await r.json()
  const pairs=(Array.isArray(rows)?rows:[]).filter((x:any)=>String(x?.baseToken?.address||'')===WSOL&&finite(x?.priceUsd)>0)
  pairs.sort((a:any,b:any)=>finite(b?.liquidity?.usd)-finite(a?.liquidity?.usd))
  const price=finite(pairs[0]?.priceUsd)
  if(price<=0)throw new Error('SOL_PRICE_UNAVAILABLE')
  return price
}
async function priorityMicroLamports(connection:Connection){
  try{
    const rows=await connection.getRecentPrioritizationFees()
    const values=rows.map(x=>Number(x.prioritizationFee)).filter(x=>Number.isFinite(x)&&x>=0).sort((a,b)=>a-b)
    if(!values.length)return 1000
    const p75=values[Math.min(values.length-1,Math.floor(values.length*.75))]
    const cap=Math.max(1000,Math.round(finite(process.env.PAPER_MAX_PRIORITY_FEE_MICROLAMPORTS,50000)))
    return Math.max(1000,Math.min(cap,Math.round(p75)))
  }catch{return 1000}
}
async function signatureState(connection:Connection,signature:string){
  const res=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})
  const s=res.value[0]
  if(!s)return{landed:false,failed:false,slot:0,confirmation:null as string|null}
  return{
    landed:!s.err&&(s.confirmationStatus==='confirmed'||s.confirmationStatus==='finalized'),
    failed:Boolean(s.err),slot:Number(s.slot||0),confirmation:s.confirmationStatus||null
  }
}
async function networkFee(connection:Connection,signature:string){
  try{
    const tx=await connection.getTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0})
    const fee=Number(tx?.meta?.fee)
    return Number.isFinite(fee)&&fee>=0?Math.round(fee):0
  }catch{return 0}
}
async function artifactGet(admin:any,settlementId:string){
  const {data,error}=await admin.rpc('paper_payout_artifact_get_v1',{p_settlement_id:settlementId})
  if(error)throw new Error(error.message)
  return data||null
}
async function artifactPut(admin:any,a:{
  settlementId:string;attemptNo:number;signature:string;signedB64:string;blockhash:string;lastValidBlockHeight:number;
  destination:string;asset:'USDC'|'SOL';assetAmount:number;status:string;broadcastAt?:string|null;confirmedAt?:string|null;lastError?:string|null
}){
  const {data,error}=await admin.rpc('paper_payout_artifact_upsert_v1',{
    p_settlement_id:a.settlementId,p_attempt_no:a.attemptNo,p_signature:a.signature,
    p_signed_transaction_base64:a.signedB64,p_blockhash:a.blockhash,p_last_valid_block_height:a.lastValidBlockHeight,
    p_destination_address:a.destination,p_payout_asset:a.asset,p_payout_asset_amount:a.assetAmount,
    p_status:a.status,p_broadcast_at:a.broadcastAt||null,p_confirmed_at:a.confirmedAt||null,p_last_error:a.lastError||null
  })
  if(error)throw new Error(error.message)
  return data
}
async function finalize(admin:any,connection:Connection,settlement:any,signature:string,slot:number,assetAmount:number,artifact:any,solUsdPrice?:number){
  const feeLamports=await networkFee(connection,signature)
  const solUsdPriceFinal=solUsdPrice&&solUsdPrice>0?solUsdPrice:await freshSolUsd(admin).catch(()=>0)
  const feeUsd=feeLamports>0&&solUsdPriceFinal>0?(feeLamports/1e9)*solUsdPriceFinal:0
  const now=new Date().toISOString()

  await admin.from('paper_funded_settlements').update({
    payout_tx_signature:signature,payout_confirmation_slot:slot,payout_network_fee_lamports:feeLamports,
    payout_network_fee_usd:feeUsd,payout_last_checked_at:now,payout_error:null
  }).eq('id',settlement.id)

  const {data:result,error}=await admin.rpc('paper_finalize_funded_payout_v1',{
    p_settlement_id:settlement.id,p_tx_signature:signature,p_confirmation_slot:slot,p_asset_amount:assetAmount
  })
  if(error)throw new Error(error.message)

  await artifactPut(admin,{
    settlementId:settlement.id,attemptNo:Number(artifact.attempt_no||1),signature,
    signedB64:String(artifact.signed_transaction_base64),blockhash:String(artifact.blockhash),
    lastValidBlockHeight:Number(artifact.last_valid_block_height),destination:String(artifact.destination_address),
    asset:String(artifact.payout_asset) as 'USDC'|'SOL',assetAmount:Number(artifact.payout_asset_amount),
    status:'confirmed',broadcastAt:artifact.broadcast_at||now,confirmedAt:now,lastError:null
  })
  return{result,feeLamports,feeUsd}
}

export async function POST(req:NextRequest){
  if(process.env.PAPER_REAL_MONEY_SERVER_ENABLED!=='true')return out({error:'REAL_MONEY_SERVER_DISABLED'},503)
  const requestId=crypto.randomUUID()
  let admin:any=null
  let settlementId=''
  try{
    const {url,pub,secret}=serverConfig()
    const auth=req.headers.get('authorization')
    if(!auth?.startsWith('Bearer '))return out({error:'authentication required'},401)
    const userClient=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
    admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:{user},error:userError}=await userClient.auth.getUser()
    if(userError||!user||user.is_anonymous)return out({error:'verified admin login required'},401)

    const {data:adminRow,error:adminError}=await admin.from('paper_admin_users')
      .select('role,enabled,requires_strong_auth').eq('user_id',user.id).maybeSingle()
    if(adminError)throw new Error(adminError.message)
    if(!adminRow?.enabled||!['owner','admin'].includes(String(adminRow.role)))return out({error:'admin access required'},403)
    const requireAal2=adminRow.requires_strong_auth!==false
    if(!(await validateActiveSession(admin,user.id,auth,requireAal2))){
      return out({error:requireAal2?'STRONG_AUTH_REQUIRED':'session revoked or expired'},403)
    }

    const contentLength=Number(req.headers.get('content-length')||0)
    if(contentLength>8192)return out({error:'request body too large'},413)
    const body=await req.json().catch(()=>({}))
    settlementId=String(body?.settlementId||'').trim()
    if(!/^[0-9a-f-]{36}$/i.test(settlementId))return out({error:'valid settlementId required'},400)

    const [{data:flags,error:flagError},{data:control,error:controlError},{data:settlement,error:settlementError}]=await Promise.all([
      admin.from('paper_platform_flags').select('*').eq('id',true).single(),
      admin.from('paper_control_plane').select('emergency_pause').eq('id',true).single(),
      admin.from('paper_funded_settlements').select('*').eq('id',settlementId).maybeSingle(),
    ])
    if(flagError)throw new Error(flagError.message)
    if(controlError)throw new Error(controlError.message)
    if(!launchGatesOpen(flags))return out({error:'REAL_PAYOUTS_DISABLED'},409)
    if(control?.emergency_pause)return out({error:'PLATFORM_PAUSED'},409)
    if(settlementError)throw new Error(settlementError.message)
    if(!settlement)return out({error:'SETTLEMENT_NOT_FOUND'},404)
    if(settlement.status==='paid')return out({ok:true,idempotent:true,status:'paid',txSignature:settlement.payout_tx_signature,asset:settlement.payout_asset,amount:settlement.payout_asset_amount})
    if(settlement.status!=='approved'||!settlement.approved_by||!settlement.approved_at)return out({error:'ADMIN_APPROVAL_REQUIRED'},409)
    const payoutRate=await consumeServerRateLimit(admin,'funded_payout',user.id,5,300)
    if(payoutRate?.allowed===false)return out({error:'RATE_LIMITED',retryAfterSeconds:payoutRate.retry_after_seconds||300},429)
    if(finite(settlement.trader_share_usd)<25)return out({error:'PAYOUT_BELOW_MINIMUM'},409)
    if(finite(settlement.trader_share_usd)>2000&&(!settlement.second_approved_by||!settlement.second_approved_at||settlement.second_approved_by===settlement.approved_by)){
      return out({error:'SECOND_ADMIN_APPROVAL_REQUIRED'},409)
    }
    if(!settlement.payout_wallet_snapshot)return out({error:'VERIFIED_PAYOUT_WALLET_REQUIRED'},409)

    const [{data:profile,error:profileError},{data:account,error:accountError},{data:security,error:securityError},{count:openPositions}]=await Promise.all([
      admin.from('paper_funded_profiles').select('kyc_status,aml_status,sanctions_status,jurisdiction_status,age_verified,tax_status,payout_wallet_address,payout_wallet_verified_at,stage').eq('user_id',settlement.user_id).single(),
      admin.from('paper_funded_accounts').select('id,status,breach_reason').eq('id',settlement.funded_account_id).single(),
      admin.from('account_security').select('payout_wallet_address,flagged_for_review,risk_reasons').eq('user_id',settlement.user_id).maybeSingle(),
      admin.from('paper_funded_positions').select('id',{count:'exact',head:true}).eq('funded_account_id',settlement.funded_account_id).eq('status','open').gt('quantity_tokens',0),
    ])
    if(profileError)throw new Error(profileError.message)
    if(accountError)throw new Error(accountError.message)
    if(securityError)throw new Error(securityError.message)
    if(profile.kyc_status!=='verified'||profile.aml_status!=='clear'||profile.sanctions_status!=='clear'||profile.jurisdiction_status!=='allowed'||profile.age_verified!==true){
      return out({error:'COMPLIANCE_NOT_READY'},409)
    }
    if(['required','collecting','review'].includes(String(profile.tax_status)))return out({error:'TAX_READINESS_REQUIRED'},409)
    if(profile.payout_wallet_verified_at==null||security?.flagged_for_review)return out({error:'PAYOUT_ACCOUNT_REVIEW_REQUIRED'},409)
    if(String(profile.payout_wallet_address||'')!==String(settlement.payout_wallet_snapshot)||String(security?.payout_wallet_address||'')!==String(settlement.payout_wallet_snapshot)){
      return out({error:'PAYOUT_WALLET_CHANGED_REVIEW_REQUIRED'},409)
    }
    if(account.status!=='active'||account.breach_reason)return out({error:'FUNDED_ACCOUNT_NOT_PAYABLE'},409)
    if((openPositions||0)>0)return out({error:'POSITIONS_MUST_BE_FLAT'},409)

    const connection=new Connection(rpcUrl(),'confirmed')
    const destination=new PublicKey(String(settlement.payout_wallet_snapshot))
    const asset=String(settlement.payout_asset||'USDC') as 'USDC'|'SOL'
    if(asset!=='USDC'&&asset!=='SOL')return out({error:'UNSUPPORTED_PAYOUT_ASSET'},400)

    const existing=await artifactGet(admin,settlementId)
    if(existing?.signature){
      const state=await signatureState(connection,String(existing.signature))
      await admin.from('paper_funded_settlements').update({payout_last_checked_at:new Date().toISOString()}).eq('id',settlementId)
      if(state.landed){
        const done=await finalize(admin,connection,settlement,String(existing.signature),state.slot,Number(existing.payout_asset_amount),existing)
        await admin.from('paper_admin_audit_log').insert({
          actor_user_id:user.id,actor_role:adminRow.role,action:'finalize_funded_payout',
          target_type:'settlement',target_id:settlementId,before_state:{status:settlement.status},
          after_state:{status:'paid',tx_signature:existing.signature,asset,amount:existing.payout_asset_amount},
          request_id:requestId
        })
        return out({ok:true,reconciled:true,status:'paid',txSignature:existing.signature,asset,amount:existing.payout_asset_amount,networkFeeUsd:done.feeUsd})
      }
      if(!state.failed){
        const currentHeight=await connection.getBlockHeight('confirmed')
        if(currentHeight<=Number(existing.last_valid_block_height)){
          const raw=Buffer.from(String(existing.signed_transaction_base64),'base64')
          const rebroadcast=await connection.sendRawTransaction(raw,{skipPreflight:false,maxRetries:3,preflightCommitment:'confirmed'})
          if(rebroadcast!==String(existing.signature))throw new Error('PAYOUT_SIGNATURE_MISMATCH')
          const confirmation=await connection.confirmTransaction({
            signature:String(existing.signature),blockhash:String(existing.blockhash),
            lastValidBlockHeight:Number(existing.last_valid_block_height)
          },'confirmed')
          if(!confirmation.value.err){
            const state2=await signatureState(connection,String(existing.signature))
            if(state2.landed){
              const done=await finalize(admin,connection,settlement,String(existing.signature),state2.slot,Number(existing.payout_asset_amount),{...existing,broadcast_at:existing.broadcast_at||new Date().toISOString()})
              return out({ok:true,reconciled:true,rebroadcast:true,status:'paid',txSignature:existing.signature,asset,amount:existing.payout_asset_amount,networkFeeUsd:done.feeUsd})
            }
          }
          return out({ok:false,status:'broadcast',txSignature:existing.signature,message:'Payout is broadcast and awaiting confirmation.'},202)
        }
      }
      await artifactPut(admin,{
        settlementId,attemptNo:Number(existing.attempt_no||1),signature:String(existing.signature),
        signedB64:String(existing.signed_transaction_base64),blockhash:String(existing.blockhash),
        lastValidBlockHeight:Number(existing.last_valid_block_height),destination:String(existing.destination_address),
        asset:String(existing.payout_asset) as 'USDC'|'SOL',assetAmount:Number(existing.payout_asset_amount),
        status:state.failed?'failed':'expired',broadcastAt:existing.broadcast_at||null,confirmedAt:null,
        lastError:state.failed?'on-chain transaction failed':'blockhash expired before confirmation'
      })
    }

    const {organizationId,policyId,wallet,signer}=payoutSigner()
    const treasuryAddress=wallet.toBase58()
    const reserveLamports=Math.max(5_000_000,Math.round(finite(process.env.PAPER_PAYOUT_SOL_RESERVE_LAMPORTS,10_000_000)))
    const treasurySol=await connection.getBalance(wallet,'confirmed')
    if(treasurySol<reserveLamports)return out({error:'PAYOUT_TREASURY_SOL_RESERVE_LOW'},409)

    const traderUsd=finite(settlement.trader_share_usd)
    const instructions=[ComputeBudgetProgram.setComputeUnitPrice({microLamports:await priorityMicroLamports(connection)})]
    let assetAmount=0
    let solUsdPrice=0

    if(asset==='USDC'){
      const mint=new PublicKey(process.env.PAPER_USDC_MINT||DEFAULT_USDC)
      const sourceAta=getAssociatedTokenAddressSync(mint,wallet)
      const destinationAta=getAssociatedTokenAddressSync(mint,destination)
      const raw=BigInt(Math.floor(traderUsd*1_000_000+0.000001))
      if(raw<=BigInt(0))return out({error:'INVALID_PAYOUT_AMOUNT'},400)
      const balance=await connection.getTokenAccountBalance(sourceAta,'confirmed').catch(()=>null)
      if(!balance||BigInt(balance.value.amount)<raw)return out({error:'PAYOUT_TREASURY_USDC_INSUFFICIENT'},409)
      instructions.push(createAssociatedTokenAccountIdempotentInstruction(wallet,destinationAta,destination,mint))
      instructions.push(createTransferCheckedInstruction(sourceAta,mint,destinationAta,wallet,raw,6))
      assetAmount=Number(raw)/1e6
    }else{
      solUsdPrice=await freshSolUsd(admin)
      const lamports=BigInt(Math.floor((traderUsd/solUsdPrice)*1e9))
      if(lamports<=BigInt(0))return out({error:'INVALID_PAYOUT_AMOUNT'},400)
      const needed=Number(lamports)+reserveLamports
      if(!Number.isSafeInteger(needed)||treasurySol<needed)return out({error:'PAYOUT_TREASURY_SOL_INSUFFICIENT'},409)
      instructions.push(SystemProgram.transfer({fromPubkey:wallet,toPubkey:destination,lamports}))
      assetAmount=Number(lamports)/1e9
    }

    instructions.push(new TransactionInstruction({
      programId:MEMO_PROGRAM,keys:[],data:Buffer.from('PAPER_PAYOUT:'+settlementId,'utf8')
    }))

    const latest=await connection.getLatestBlockhash('confirmed')
    const message=new TransactionMessage({
      payerKey:wallet,recentBlockhash:latest.blockhash,instructions
    }).compileToV0Message()
    const tx=new VersionedTransaction(message)
    const signed=await signer.signTransaction(tx,treasuryAddress,organizationId) as VersionedTransaction
    const signature=bs58.encode(signed.signatures[0])
    const signedB64=Buffer.from(signed.serialize()).toString('base64')
    const attemptNo=Number(existing?.attempt_no||0)+1
    const now=new Date().toISOString()

    const artifact=await artifactPut(admin,{
      settlementId,attemptNo,signature,signedB64,blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,
      destination:destination.toBase58(),asset,assetAmount,status:'signed',broadcastAt:null,confirmedAt:null,lastError:null
    })
    await admin.from('paper_funded_settlements').update({
      payout_tx_signature:signature,payout_attempts:attemptNo,payout_last_checked_at:now,payout_error:null
    }).eq('id',settlementId)

    const sent=await connection.sendRawTransaction(Buffer.from(signed.serialize()),{skipPreflight:false,maxRetries:3,preflightCommitment:'confirmed'})
    if(sent!==signature)throw new Error('PAYOUT_SIGNATURE_MISMATCH')
    const broadcastAt=new Date().toISOString()
    await artifactPut(admin,{
      settlementId,attemptNo,signature,signedB64,blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,
      destination:destination.toBase58(),asset,assetAmount,status:'broadcast',broadcastAt,confirmedAt:null,lastError:null
    })
    await admin.from('paper_funded_settlements').update({
      payout_broadcast_at:broadcastAt,payout_last_checked_at:broadcastAt
    }).eq('id',settlementId)

    const confirmation=await connection.confirmTransaction({
      signature,blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight
    },'confirmed')
    if(confirmation.value.err)throw new Error('PAYOUT_TRANSACTION_FAILED')

    const state=await signatureState(connection,signature)
    if(!state.landed)return out({ok:false,status:'broadcast',txSignature:signature,message:'Payout broadcast succeeded; confirmation is still pending.'},202)

    const done=await finalize(admin,connection,settlement,signature,state.slot,assetAmount,{...artifact,broadcast_at:broadcastAt},solUsdPrice)
    await admin.from('paper_admin_audit_log').insert({
      actor_user_id:user.id,actor_role:adminRow.role,action:'execute_funded_payout',
      target_type:'settlement',target_id:settlementId,
      before_state:{status:settlement.status,trader_share_usd:settlement.trader_share_usd,payout_asset:asset},
      after_state:{status:'paid',tx_signature:signature,destination:destination.toBase58(),asset,asset_amount:assetAmount,network_fee_usd:done.feeUsd,turnkey_policy_id:policyId},
      request_id:requestId
    })
    return out({ok:true,status:'paid',txSignature:signature,asset,amount:assetAmount,destination:destination.toBase58(),networkFeeUsd:done.feeUsd,reset:done.result})
  }catch(error){
    const message=error instanceof Error?error.message:'payout execution failed'
    if(admin&&settlementId){
      await admin.from('paper_funded_settlements').update({
        payout_error:message.slice(0,500),payout_last_checked_at:new Date().toISOString()
      }).eq('id',settlementId)
    }
    return out({error:message},409)
  }
}
