'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import bs58 from 'bs58'
import { AlertTriangle, CheckCircle2, Clock3, LockKeyhole, ShieldCheck, WalletCards } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'

const SumsubWebSdk=dynamic(()=>import('@sumsub/websdk-react'),{ssr:false})

type Readiness={
  user_id:string;stage:string;kyc_status:string;aml_status:string;sanctions_status:string;jurisdiction_status:string
  age_verified:boolean;tax_status:string;payout_wallet_verified_at:string|null;preferred_payout_asset:'USDC'|'SOL'
  provider_kyc_status:string|null;provider_aml_status:string|null;provider_sanctions_status:string|null
  custody_status:string|null;wallet_account_address:string|null;funded_ready:boolean
  legal_review_complete:boolean;legal_entity_ready:boolean;kyc_provider_configured:boolean
  aml_sanctions_controls_ready:boolean;jurisdiction_allowlist_ready:boolean;turnkey_signing_enabled:boolean
  custody_security_review_complete:boolean;treasury_capital_available:boolean;real_funded_activation:boolean;real_payouts_enabled:boolean
}
type Waitlist={status:string;priority:number;qualified_at:string;hold_reason:string|null}
type Scale={scale_level:number;capital_usd:number;consecutive_profitable_cycles:number;next_capital_usd:number}
type Account={id:string;status:string;capital_usd:number;cash_usd:number;current_equity_usd:number;peak_equity_usd:number;trailing_floor_usd:number;daily_loss_usd:number;current_drawdown_pct:number;data_status:string;breach_reason:string|null;activated_at:string|null}
type Position={id:string;token_address:string;token_symbol:string|null;quantity_tokens:number;cost_basis_usd:number;average_entry_price_usd:number;realized_pnl_usd:number;status:string}
type Settlement={id:string;week_start:string;week_end:string;eligible_profit_usd:number;trader_share_usd:number;paper_share_usd:number;status:string;payout_asset:string;payout_tx_signature:string|null;paid_at:string|null}
type Security={payout_wallet_address:string|null;flagged_for_review:boolean}
type Kyc={status:string;aml_status:string;sanctions_status:string;country_code:string|null;age_verified:boolean|null;last_webhook_at:string|null}
const money=(n:number)=>'$'+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})
const gateLabel=(v:boolean)=>v?'READY':'LOCKED'

export default function FundedPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [readiness,setReadiness]=useState<Readiness|null>(null),[waitlist,setWaitlist]=useState<Waitlist|null>(null),[scale,setScale]=useState<Scale|null>(null)
  const [account,setAccount]=useState<Account|null>(null),[positions,setPositions]=useState<Position[]>([]),[settlement,setSettlement]=useState<Settlement|null>(null)
  const [security,setSecurity]=useState<Security|null>(null),[kyc,setKyc]=useState<Kyc|null>(null),[loading,setLoading]=useState(true),[message,setMessage]=useState('')
  const [kycToken,setKycToken]=useState(''),[kycBusy,setKycBusy]=useState(false),[walletBusy,setWalletBusy]=useState(false)
  const [mint,setMint]=useState(''),[tradeSide,setTradeSide]=useState<'buy'|'sell'>('buy'),[notional,setNotional]=useState(50),[sellPct,setSellPct]=useState(100),[slippage,setSlippage]=useState(300),[tradeBusy,setTradeBusy]=useState(false)

  const load=useCallback(async()=>{
    if(!supabase)return
    try{
      const user=await ensurePaperUser(supabase)
      const [r,w,s,a,p,st,sec,k]=await Promise.all([
        supabase.from('paper_funded_readiness').select('*').eq('user_id',user.id).maybeSingle(),
        supabase.from('paper_funded_waitlist').select('status,priority,qualified_at,hold_reason').eq('user_id',user.id).maybeSingle(),
        supabase.from('paper_funded_scale_state').select('scale_level,capital_usd,consecutive_profitable_cycles,next_capital_usd').eq('user_id',user.id).maybeSingle(),
        supabase.from('paper_funded_accounts').select('id,status,capital_usd,cash_usd,current_equity_usd,peak_equity_usd,trailing_floor_usd,daily_loss_usd,current_drawdown_pct,data_status,breach_reason,activated_at').eq('user_id',user.id).maybeSingle(),
        supabase.from('paper_funded_positions').select('id,token_address,token_symbol,quantity_tokens,cost_basis_usd,average_entry_price_usd,realized_pnl_usd,status').eq('user_id',user.id).eq('status','open').order('updated_at',{ascending:false}),
        supabase.from('paper_funded_settlements').select('id,week_start,week_end,eligible_profit_usd,trader_share_usd,paper_share_usd,status,payout_asset,payout_tx_signature,paid_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
        supabase.from('account_security').select('payout_wallet_address,flagged_for_review').eq('user_id',user.id).maybeSingle(),
        supabase.from('paper_kyc_cases').select('status,aml_status,sanctions_status,country_code,age_verified,last_webhook_at').eq('user_id',user.id).maybeSingle(),
      ])
      const errors=[r.error,w.error,s.error,a.error,p.error,st.error,sec.error,k.error].filter(Boolean)
      if(errors.length)throw errors[0]
      setReadiness((r.data as Readiness|null)||null);setWaitlist((w.data as Waitlist|null)||null);setScale((s.data as Scale|null)||null)
      setAccount((a.data as Account|null)||null);setPositions((p.data||[]) as Position[]);setSettlement((st.data as Settlement|null)||null)
      setSecurity((sec.data as Security|null)||null);setKyc((k.data as Kyc|null)||null);setMessage('')
    }catch(e){setMessage(e instanceof Error?e.message:'Funded status unavailable')}finally{setLoading(false)}
  },[supabase])

  useEffect(()=>{void load();const id=window.setInterval(()=>{if(!document.hidden)void load()},7000);return()=>clearInterval(id)},[load])

  async function getKycToken(){
    if(!supabase)throw new Error('PAPER account service is unavailable')
    const {data,error}=await supabase.functions.invoke('kyc-session',{body:{action:'token'}})
    if(error)throw error
    if(data?.error)throw new Error(data.message||data.error)
    const token=String(data?.accessToken||'')
    if(!token)throw new Error('KYC access token unavailable')
    setKycToken(token);return token
  }
  async function startKyc(){setKycBusy(true);setMessage('');try{await getKycToken()}catch(e){setMessage(e instanceof Error?e.message:'KYC could not start')}finally{setKycBusy(false)}}

  async function linkPayoutWallet(){
    if(!supabase)return
    setWalletBusy(true);setMessage('')
    try{
      const provider=(window as unknown as {solana?:{connect:()=>Promise<{publicKey:{toString:()=>string}}> ;signMessage:(m:Uint8Array,encoding?:string)=>Promise<{signature:Uint8Array}>}}).solana
      if(!provider)throw new Error('Install or open a compatible Solana wallet such as Phantom, Solflare, or Backpack.')
      const connected=await provider.connect(),walletAddress=connected.publicKey.toString()
      const {data:challenge,error:challengeError}=await supabase.functions.invoke('payout-wallet-link',{body:{action:'challenge',walletAddress}})
      if(challengeError)throw challengeError;if(challenge?.error)throw new Error(challenge.error)
      const signed=await provider.signMessage(new TextEncoder().encode(challenge.message),'utf8')
      const signature=bs58.encode(signed.signature)
      const {data:verified,error:verifyError}=await supabase.functions.invoke('payout-wallet-link',{body:{action:'verify',walletAddress,nonce:challenge.nonce,signature}})
      if(verifyError)throw verifyError;if(verified?.error)throw new Error(verified.error)
      setMessage('Payout wallet verified. The signature proved address control only and did not authorize a transfer.')
      await load()
    }catch(e){setMessage(e instanceof Error?e.message:'Wallet verification failed')}finally{setWalletBusy(false)}
  }

  async function setPayoutAsset(asset:'USDC'|'SOL'){
    if(!supabase||!readiness)return
    const {error}=await supabase.from('paper_funded_profiles').update({preferred_payout_asset:asset,updated_at:new Date().toISOString()}).eq('user_id',readiness.user_id)
    if(error){setMessage(error.message);return}
    setReadiness({...readiness,preferred_payout_asset:asset});setMessage('Payout preference updated.')
  }

  async function submitFundedTrade(){
    if(!supabase||!account||!readiness?.real_funded_activation)return
    setTradeBusy(true);setMessage('')
    try{
      const body=tradeSide==='buy'
        ?{mint,side:'buy',notionalUsd:notional,slippageBps:slippage,idempotencyKey:crypto.randomUUID()}
        :{mint,side:'sell',sellPct,slippageBps:slippage,idempotencyKey:crypto.randomUUID()}
      const {data,error}=await supabase.functions.invoke('funded-execution',{body})
      if(error)throw error;if(data?.error)throw new Error(data.error)
      setMessage('Funded order confirmed: '+String(data?.txSignature||data?.orderId||'confirmed'))
      await load()
    }catch(e){setMessage(e instanceof Error?e.message:'Funded order failed')}finally{setTradeBusy(false)}
  }

  if(loading)return <div className="ax-app"><AppHeader active="funded"/><main className="terminal-page"><div className="terminal-page-inner"><div className="empty-card">Loading funded status…</div></div></main><BottomDock active="funded"/></div>

  const passed=Boolean(readiness),active=account?.status==='active',realEnabled=Boolean(readiness?.real_funded_activation)
  const gates=readiness?[
    ['LEGAL REVIEW',readiness.legal_review_complete],['LEGAL ENTITY',readiness.legal_entity_ready],['KYC PROVIDER',readiness.kyc_provider_configured],
    ['AML / SANCTIONS',readiness.aml_sanctions_controls_ready],['JURISDICTIONS',readiness.jurisdiction_allowlist_ready],
    ['TURNKEY SIGNING',readiness.turnkey_signing_enabled],['CUSTODY REVIEW',readiness.custody_security_review_complete],
    ['TREASURY',readiness.treasury_capital_available],['REAL FUNDED',readiness.real_funded_activation],['PAYOUTS',readiness.real_payouts_enabled]
  ] as [string,boolean][]:[]

  return <div className="ax-app"><AppHeader active="funded"/><main className="terminal-page funded-page"><div className="terminal-page-inner">
    <section className="funded-hero"><div><div className="terminal-eyebrow">PAPER FUNDED</div><h1>Qualification → verification → funded account.</h1><p className="terminal-lead">Real-funded capital stays locked until every legal, KYC/AML, jurisdiction, custody, and treasury gate is complete. PAPER evaluation remains separate.</p></div><div className={'funded-master-state '+(realEnabled?'ready':'locked')}><LockKeyhole size={16}/><b>{realEnabled?'REAL FUNDED ENABLED':'REAL FUNDED LOCKED'}</b></div></section>
    {message&&<div className="terminal-error"><span>{message}</span><button onClick={()=>setMessage('')}>Dismiss</button></div>}

    {!passed?<section className="funded-not-qualified"><ShieldCheck/><div><h2>Pass the evaluation first.</h2><p>Your funded profile is created automatically only after the rule-based PAPER evaluation passes.</p><Link className="eval-primary link" href="/evaluation">Open evaluation</Link></div></section>:<>
      <section className="funded-stage-strip">
        <div><small>STAGE</small><b>{String(readiness?.stage||'—').replaceAll('_',' ').toUpperCase()}</b></div>
        <div><small>KYC</small><b>{readiness?.kyc_status||'—'}</b></div>
        <div><small>AML</small><b>{readiness?.aml_status||'—'}</b></div>
        <div><small>SANCTIONS</small><b>{readiness?.sanctions_status||'—'}</b></div>
        <div><small>JURISDICTION</small><b>{readiness?.jurisdiction_status||'—'}</b></div>
        <div><small>CUSTODY</small><b>{readiness?.custody_status||'not provisioned'}</b></div>
      </section>

      <section className="funded-grid">
        <article className="funded-card"><div className="funded-card-title"><ShieldCheck size={15}/><div><b>IDENTITY & COMPLIANCE</b><span>Sumsub KYC + AML/sanctions review</span></div></div>
          <div className="funded-check-list">
            <span><i className={readiness?.kyc_status==='verified'?'on':''}/><b>KYC</b><small>{readiness?.kyc_status}</small></span>
            <span><i className={readiness?.age_verified?'on':''}/><b>18+</b><small>{readiness?.age_verified?'verified':'not verified'}</small></span>
            <span><i className={readiness?.aml_status==='clear'?'on':''}/><b>AML</b><small>{readiness?.aml_status}</small></span>
            <span><i className={readiness?.sanctions_status==='clear'?'on':''}/><b>Sanctions</b><small>{readiness?.sanctions_status}</small></span>
            <span><i className={readiness?.jurisdiction_status==='allowed'?'on':''}/><b>Jurisdiction</b><small>{readiness?.jurisdiction_status}</small></span>
          </div>
          {readiness?.kyc_status!=='verified'&&<button className="profile-save" disabled={kycBusy||!readiness?.kyc_provider_configured} onClick={()=>void startKyc()}>{kycBusy?'OPENING KYC…':readiness?.kyc_provider_configured?'START / CONTINUE KYC':'KYC PROVIDER NOT ENABLED'}</button>}
          {kycToken&&<div className="funded-kyc-shell"><SumsubWebSdk accessToken={kycToken} expirationHandler={getKycToken} config={{lang:'en',theme:'dark'} as any} options={{addViewportTag:false,adaptIframeHeight:true}} onMessage={()=>void load()} onError={(e:unknown)=>setMessage(e instanceof Error?e.message:'KYC SDK error')}/></div>}
          {kyc?.last_webhook_at&&<small>Last provider update: {new Date(kyc.last_webhook_at).toLocaleString()}</small>}
        </article>

        <article className="funded-card"><div className="funded-card-title"><WalletCards size={15}/><div><b>CUSTODY & PAYOUT</b><span>Trading wallet is PAPER-controlled; payout address is yours</span></div></div>
          <div className="funded-key-values"><span><small>Turnkey custody</small><b>{readiness?.custody_status||'not provisioned'}</b></span><span><small>Custody address</small><b>{readiness?.wallet_account_address?readiness.wallet_account_address.slice(0,7)+'…'+readiness.wallet_account_address.slice(-6):'—'}</b></span><span><small>Payout wallet</small><b>{security?.payout_wallet_address?security.payout_wallet_address.slice(0,7)+'…'+security.payout_wallet_address.slice(-6):'not linked'}</b></span></div>
          {!security?.payout_wallet_address&&<button className="profile-save" disabled={walletBusy} onClick={()=>void linkPayoutWallet()}>{walletBusy?'VERIFYING…':'VERIFY PAYOUT WALLET'}</button>}
          <div className="funded-payout-choice"><button className={readiness?.preferred_payout_asset==='USDC'?'active':''} onClick={()=>void setPayoutAsset('USDC')}>USDC DEFAULT</button><button className={readiness?.preferred_payout_asset==='SOL'?'active':''} onClick={()=>void setPayoutAsset('SOL')}>SOL</button></div>
          <small>Wallet verification uses a signed message only. It never grants PAPER permission to move assets from your wallet.</small>
        </article>

        <article className="funded-card"><div className="funded-card-title"><Clock3 size={15}/><div><b>WAITLIST & SCALE</b><span>Capital allocation remains treasury-controlled</span></div></div>
          <div className="funded-key-values"><span><small>Waitlist</small><b>{waitlist?.status||'—'}</b></span><span><small>Current tier</small><b>{scale?money(scale.capital_usd):'$1,000.00'}</b></span><span><small>Next tier</small><b>{scale?money(scale.next_capital_usd):'$2,500.00'}</b></span><span><small>Profitable cycles</small><b>{scale?.consecutive_profitable_cycles||0} / 2</b></span></div>
          {waitlist?.hold_reason&&<small>{waitlist.hold_reason}</small>}
        </article>

        <article className="funded-card"><div className="funded-card-title"><AlertTriangle size={15}/><div><b>LAUNCH GATES</b><span>Real money cannot bypass these controls</span></div></div>
          <div className="funded-gates">{gates.map(([label,value])=><span key={label}><i className={value?'on':''}/><b>{label}</b><small>{gateLabel(value)}</small></span>)}</div>
        </article>
      </section>

      {account&&<section className="funded-account-panel"><div className="funded-account-head"><div><div className="terminal-eyebrow">FUNDED ACCOUNT</div><h2>{money(account.current_equity_usd)} equity</h2></div><span className={'funded-master-state '+(active?'ready':'locked')}>{account.status.toUpperCase()}</span></div>
        <div className="funded-account-kpis"><span><small>CAPITAL</small><b>{money(account.capital_usd)}</b></span><span><small>CASH</small><b>{money(account.cash_usd)}</b></span><span><small>PEAK</small><b>{money(account.peak_equity_usd)}</b></span><span><small>15% TRAILING FLOOR</small><b>{money(account.trailing_floor_usd)}</b></span><span><small>DAILY LOSS</small><b>{money(account.daily_loss_usd)} / {money(account.capital_usd*.05)}</b></span><span><small>DATA</small><b>{account.data_status}</b></span></div>
        {account.breach_reason&&<div className="funded-breach"><AlertTriangle size={14}/><b>{account.breach_reason.replaceAll('_',' ')}</b></div>}
      </section>}

      {active&&realEnabled&&<section className="funded-trade-card"><div className="funded-card-title"><CheckCircle2 size={15}/><div><b>FUNDED EXECUTION</b><span>Turnkey policy + Jupiter route + server risk preflight</span></div></div>
        <div className="funded-trade-form"><label>Solana mint<input value={mint} onChange={e=>setMint(e.target.value.trim())} placeholder="Token contract address"/></label><div className="side-switch"><button className={tradeSide==='buy'?'buy':''} onClick={()=>setTradeSide('buy')}>Buy</button><button className={tradeSide==='sell'?'sell':''} onClick={()=>setTradeSide('sell')}>Sell</button></div>{tradeSide==='buy'?<label>Notional USD<input type="number" min="1" value={notional} onChange={e=>setNotional(Number(e.target.value)||0)}/></label>:<label>Sell %<input type="number" min="1" max="100" value={sellPct} onChange={e=>setSellPct(Number(e.target.value)||0)}/></label>}<label>Slippage bps<input type="number" min="1" max="500" value={slippage} onChange={e=>setSlippage(Number(e.target.value)||300)}/></label><button className="profile-save" disabled={tradeBusy||!mint} onClick={()=>void submitFundedTrade()}>{tradeBusy?'EXECUTING…':'SUBMIT FUNDED ORDER'}</button></div>
        <small>Default slippage 3%; hard maximum 5%. Future funded buys are blocked when live risk data crosses policy thresholds.</small>
      </section>}

      <section className="funded-grid funded-lower">
        <article className="funded-card"><div className="funded-card-title"><WalletCards size={15}/><div><b>OPEN FUNDED POSITIONS</b><span>{positions.length} / 5</span></div></div>{!positions.length?<div className="funded-empty">No open funded positions.</div>:<div className="funded-position-list">{positions.map(p=><div key={p.id}><b>{p.token_symbol?'$'+p.token_symbol:p.token_address.slice(0,8)+'…'}</b><span>{Number(p.quantity_tokens).toLocaleString()} tokens</span><span>{money(p.cost_basis_usd)} cost</span></div>)}</div>}</article>
        <article className="funded-card"><div className="funded-card-title"><Clock3 size={15}/><div><b>LATEST SETTLEMENT</b><span>Friday 17:00 UTC · 90/10 · $25 minimum</span></div></div>{!settlement?<div className="funded-empty">No funded settlement yet.</div>:<div className="funded-key-values"><span><small>Eligible profit</small><b>{money(settlement.eligible_profit_usd)}</b></span><span><small>Your 90%</small><b>{money(settlement.trader_share_usd)}</b></span><span><small>PAPER 10%</small><b>{money(settlement.paper_share_usd)}</b></span><span><small>Status</small><b>{settlement.status}</b></span><span><small>Asset</small><b>{settlement.payout_asset}</b></span></div>}</article>
      </section>
    </>}
  </div></main><BottomDock active="funded"/></div>
}
