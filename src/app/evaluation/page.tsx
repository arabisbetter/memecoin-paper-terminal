'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Clock3, LockKeyhole, ShieldCheck, Target, TriangleAlert } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'

type Evaluation={
  id?:string;attempt_no?:number;status?:'active'|'passed'|'failed'|'expired'|'cancelled';starting_balance_usd?:number;profit_target_usd?:number;pass_equity_usd?:number;trailing_drawdown_pct?:number;max_daily_loss_usd?:number;max_position_pct?:number;max_single_trade_pct?:number;max_open_positions?:number;min_trades?:number;starts_at?:string;expires_at?:string;ended_at?:string|null;cooldown_until?:string|null;peak_equity_usd?:number;trailing_floor_usd?:number;equity_usd?:number;last_equity_usd?:number;cash_usd?:number;last_cash_usd?:number;open_value_usd?:number;last_open_value_usd?:number;daily_loss_usd?:number;current_drawdown_pct?:number;trades_count?:number;failure_reason?:string|null;data_status?:string;mark_error?:string
}
type StatusPayload={ok?:boolean;anonymous?:boolean;hasEvaluation?:boolean;evaluation?:Evaluation|null;rules?:Record<string,number|string>;error?:string}
const clamp=(n:number)=>Math.max(0,Math.min(100,n))
const money=(n:number)=>`$${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`
const failureLabel=(v?:string|null)=>v==='trailing_drawdown_breach'?'10% trailing drawdown breached':v==='daily_loss_breach'?'$50 UTC daily loss limit breached':v==='30_day_window_expired'?'30-day evaluation window expired':v||'Evaluation ended'

function Ring({value,label,detail,tone='cyan'}:{value:number;label:string;detail:string;tone?:'cyan'|'red'|'green'}){
  const p=clamp(value),accent=tone==='red'?'#ff5f77':tone==='green'?'#55e6a5':'#6edcff'
  return <div className="eval-ring-card"><div className="eval-ring" style={{background:`conic-gradient(${accent} ${p*3.6}deg, rgba(255,255,255,.07) 0deg)`}}><div><b>{p.toFixed(0)}%</b><small>{label}</small></div></div><span>{detail}</span></div>
}

export default function EvaluationPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [payload,setPayload]=useState<StatusPayload|null>(null),[loading,setLoading]=useState(true),[starting,setStarting]=useState(false),[email,setEmail]=useState(''),[emailBusy,setEmailBusy]=useState(false),[emailSent,setEmailSent]=useState(false),[message,setMessage]=useState(''),[now,setNow]=useState(0)

  const load=useCallback(async()=>{
    if(!supabase){setMessage('PAPER account service is not configured.');setLoading(false);return}
    try{
      await ensurePaperUser(supabase)
      const {data,error}=await supabase.functions.invoke('evaluation-status',{body:{action:'status'}})
      if(error)throw error
      setPayload(data as StatusPayload);setMessage((data as StatusPayload)?.error||'')
    }catch(e){setMessage(e instanceof Error?e.message:'Evaluation service unavailable')}finally{setLoading(false)}
  },[supabase])

  useEffect(()=>{const start=window.setTimeout(()=>{setNow(Date.now());void load()},0),poll=window.setInterval(()=>{if(!document.hidden)void load()},3500),tick=window.setInterval(()=>setNow(Date.now()),1000);return()=>{clearTimeout(start);clearInterval(poll);clearInterval(tick)}},[load])

  async function secureAccount(){
    if(!supabase)return
    const value=email.trim().toLowerCase()
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)){setMessage('Enter a valid email address.');return}
    setEmailBusy(true);setMessage('')
    try{
      const {error}=await supabase.auth.updateUser({email:value},{emailRedirectTo:`${location.origin}/evaluation`})
      if(error)throw error
      setEmailSent(true)
    }catch(e){setMessage(e instanceof Error?e.message:'Could not add recovery email')}finally{setEmailBusy(false)}
  }

  async function refreshIdentity(){
    if(!supabase)return
    setEmailBusy(true);setMessage('')
    try{await supabase.auth.refreshSession();const {data,error}=await supabase.auth.getUser();if(error)throw error;if(data.user?.is_anonymous)throw new Error('Email is not verified yet. Open the confirmation email first.');await load()}catch(e){setMessage(e instanceof Error?e.message:'Could not refresh account')}finally{setEmailBusy(false)}
  }

  async function startEvaluation(){
    if(!supabase)return
    if(payload?.anonymous){setMessage('Secure this account with a verified email before entering the evaluation.');return}
    setStarting(true);setMessage('')
    try{const {data,error}=await supabase.functions.invoke('evaluation-status',{body:{action:'start'}});if(error)throw error;const body=data as StatusPayload;if(body?.error)throw new Error(body.error);setPayload(body);await load();window.dispatchEvent(new Event('paper:account-changed'))}catch(e){setMessage(e instanceof Error?e.message:'Could not start evaluation')}finally{setStarting(false)}
  }

  const e=payload?.evaluation||null,status=e?.status||'none',equity=Number(e?.equity_usd??e?.last_equity_usd??1000),start=Number(e?.starting_balance_usd||1000),target=Number(e?.pass_equity_usd||6000),profit=Math.max(0,equity-start),profitPct=clamp((equity-start)/(target-start)*100),drawdown=Number(e?.current_drawdown_pct||0),drawdownPct=clamp(drawdown/10*100),dailyLoss=Number(e?.daily_loss_usd||0),dailyPct=clamp(dailyLoss/50*100),trades=Number(e?.trades_count||0)
  const expires=e?.expires_at?new Date(e.expires_at).getTime():0,remaining=Math.max(0,expires-now),days=Math.floor(remaining/86400000),hours=Math.floor((remaining%86400000)/3600000),mins=Math.floor((remaining%3600000)/60000),secs=Math.floor((remaining%60000)/1000)
  const cooldown=e?.cooldown_until?Math.max(0,new Date(e.cooldown_until).getTime()-now):0,coolHours=Math.floor(cooldown/3600000),coolMins=Math.floor((cooldown%3600000)/60000),coolSecs=Math.floor((cooldown%60000)/1000)
  const active=status==='active',passed=status==='passed',ended=status==='failed'||status==='expired'

  return <div className="ax-app"><AppHeader active="evaluation"/><main className="terminal-page evaluation-page"><div className="terminal-page-inner evaluation-inner">
    <section className="eval-hero"><div><div className="terminal-eyebrow">PAPER EVALUATION · FREE · PAPER-ONLY</div><h1>Prove it with PAPER.</h1><p className="terminal-lead">Start with 1,000 PAPER SOL and reach 6,000 PAPER SOL without breaking the risk rules. Passing records a PAPER evaluation result only. It does not create or unlock a funded account, custody, KYC, payouts, prizes, or real-money entitlement.</p></div><div className={`eval-status ${active?'live':passed?'passed':ended?'failed':''}`}><i/>{loading?'SYNCING':active?'EVALUATION LIVE':passed?'PASSED':ended?status.toUpperCase():'READY'}</div></section>

    {message&&<div className="terminal-error"><span><b>Evaluation:</b> {message}</span><button onClick={()=>setMessage('')}>Dismiss</button></div>}

    {!loading&&!e&&<section className="eval-start-grid"><div className="eval-start-card"><div className="eval-icon"><Target/></div><small>FREE EVALUATION</small><h2>$1,000 → $6,000</h2><p>No entry fee. PAPER uses server-recorded simulated fills against live Solana market data with a modeled 1% platform fee.</p><div className="eval-rule-mini"><span><b>10%</b> trailing drawdown</span><span><b>$50</b> max UTC daily loss</span><span><b>30 days</b> evaluation window</span><span><b>25%</b> max token/trade</span><span><b>5</b> open positions max</span><span><b>1</b> minimum trade</span></div>{!payload?.anonymous?<button className="eval-primary" onClick={()=>void startEvaluation()} disabled={starting}>{starting?'Starting…':'Start free evaluation'}</button>:<div className="eval-secure"><LockKeyhole size={18}/><div><b>Secure account before evaluation</b><p>Normal PAPER trading stays anonymous. Evaluation entry requires a recoverable login.</p></div><input type="email" value={email} onChange={x=>setEmail(x.target.value)} placeholder="you@example.com"/><button onClick={()=>void secureAccount()} disabled={emailBusy}>{emailBusy?'Sending…':'Verify email'}</button>{emailSent&&<div className="eval-email-sent"><Check size={15}/> Confirmation sent. Open the email, then <button onClick={()=>void refreshIdentity()}>refresh identity</button>.</div>}</div>}</div><aside className="eval-truth-card"><ShieldCheck/><h3>No fake qualification.</h3><p>Fill prices come from the server execution model. Evaluation equity is marked server-side from live market prices. If required market data is unavailable, PAPER shows it as unavailable instead of inventing a price.</p><Link href="/legal#evaluation">Read evaluation terms →</Link></aside></section>}

    {e&&<><section className="eval-account-strip"><div><small>ATTEMPT</small><b>#{e.attempt_no||1}</b></div><div><small>LIVE EQUITY</small><b>{money(equity)} PAPER</b></div><div><small>PEAK EQUITY</small><b>{money(Number(e.peak_equity_usd||start))}</b></div><div><small>TRAILING FLOOR</small><b>{money(Number(e.trailing_floor_usd||start*.9))}</b></div><div><small>OPEN VALUE</small><b>{money(Number(e.open_value_usd??e.last_open_value_usd??0))}</b></div><div><small>MARK DATA</small><b className={e.data_status==='LIVE'?'gain':'loss'}>{e.data_status||'—'}</b></div></section>

    <section className="eval-progress-grid"><Ring value={profitPct} label="PROFIT TARGET" detail={`${money(profit)} / $5,000`}/><Ring value={drawdownPct} label="DRAWDOWN USED" detail={`${drawdown.toFixed(2)}% / 10%`} tone={drawdownPct>=80?'red':'cyan'}/><Ring value={dailyPct} label="DAILY LOSS USED" detail={`${money(dailyLoss)} / $50 UTC`} tone={dailyPct>=80?'red':'cyan'}/><div className="eval-countdown-card"><Clock3/><small>{active?'TIME REMAINING':passed?'COMPLETED':'STATUS'}</small><b>{active?`${days}d ${hours}h ${mins}m ${secs}s`:passed?'PASSED':status.toUpperCase()}</b><span>{active?'30-day evaluation window':e.ended_at?new Date(e.ended_at).toLocaleString():'Evaluation record'}</span></div></section>

    <section className="eval-dashboard-grid"><div className="eval-checklist"><div className="eval-panel-head"><div><small>PASS / FAIL ENGINE</small><h2>Rules</h2></div><span>SERVER ENFORCED</span></div>{[
      [equity>=6000,'Reach $6,000 live equity',`${money(equity)} current`],
      [drawdown<10,'Stay inside 10% trailing drawdown',`${drawdown.toFixed(2)}% currently used`],
      [dailyLoss<50,'Stay inside $50 UTC daily loss',`${money(dailyLoss)} used today`],
      [trades>=1,'Complete at least 1 trade',`${trades} recorded`],
      [true,'Maximum 25% of live equity per token / entry','Enforced before each evaluation buy'],
      [true,'Maximum 5 simultaneous positions','Enforced before each new position'],
    ].map(([ok,label,detail],i)=><div className="eval-check" key={i}><span className={ok?'ok':'wait'}>{ok?<Check size={14}/>:<Clock3 size={14}/>}</span><div><b>{label as string}</b><small>{detail as string}</small></div></div>)}</div>

      <aside className="eval-state-card">{active?<><div className="eval-state-icon live"><Target/></div><small>ACTIVE EVALUATION</small><h2>{money(6000-equity>0?6000-equity:0)} to target</h2><p>Your trailing floor moves upward whenever live equity makes a new high. It never moves back down during this attempt.</p>{e.mark_error&&<div className="eval-warning"><TriangleAlert size={15}/>{e.mark_error}</div>}<Link className="eval-primary link" href="/spot">Trade PAPER</Link></>:passed?<><div className="eval-state-icon passed"><Check/></div><small>RULE-BASED PASS</small><h2>Evaluation passed.</h2><p>This is a PAPER-only achievement recorded on your account. It has no cash or crypto value and does not create a funded account or payout right.</p><div className="eval-funded-lock"><ShieldCheck size={15}/> PAPER-only result · real-money systems remain disabled</div></>:<><div className="eval-state-icon failed"><TriangleAlert/></div><small>{status.toUpperCase()}</small><h2>{failureLabel(e.failure_reason)}</h2><p>{cooldown>0?`A new free evaluation unlocks in ${coolHours}h ${coolMins}m ${coolSecs}s.`:'Your 24-hour retry cooldown is complete.'}</p>{cooldown<=0&&<button className="eval-primary" onClick={()=>void startEvaluation()} disabled={starting}>{starting?'Starting…':'Start next free attempt'}</button>}</>}</aside></section></>}

    <div className="eval-footnote"><b>PAPER only — no real trade, funded account, custody action, prize, or payout is created during evaluation.</b> Market data can become delayed or unavailable. PAPER does not substitute fabricated marks when a required live position price cannot be verified.</div>
  </div></main><BottomDock active="evaluation"/></div>
}
