'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowUpRight, BarChart3, Check, Eye, ShieldCheck, Zap } from 'lucide-react'
import type { MarketToken } from '@/lib/types'

const money=(n:number)=>{
  if(!Number.isFinite(n))return '—'
  if(n>=1e9)return `$${(n/1e9).toFixed(2)}B`
  if(n>=1e6)return `$${(n/1e6).toFixed(2)}M`
  if(n>=1e3)return `$${(n/1e3).toFixed(1)}K`
  if(n>=1)return `$${n.toFixed(2)}`
  if(n>=.01)return `$${n.toFixed(4)}`
  return `$${n.toPrecision(3)}`
}
const pct=(n?:number)=>`${Number(n||0)>=0?'+':''}${Number(n||0).toFixed(2)}%`
const hotScore=(t:MarketToken)=>Number(t.volume5m||0)+(Number(t.buys5m||0)+Number(t.sells5m||0))*140+Math.abs(Number(t.priceChange5m||0))*2200+Math.min(Number(t.liquidityUsd||0),300000)*.025

function PaperMark(){
  return <svg viewBox="0 0 64 64" aria-hidden="true" className="paper-mark-svg"><defs><linearGradient id="paperMarkGradient" x1="5" y1="5" x2="58" y2="58"><stop offset="0" stopColor="#8ef6ff"/><stop offset=".45" stopColor="#3c8cff"/><stop offset="1" stopColor="#955cff"/></linearGradient><linearGradient id="paperFoldGradient" x1="8" y1="10" x2="40" y2="46"><stop offset="0" stopColor="#fff"/><stop offset="1" stopColor="#76d7ff"/></linearGradient></defs><path d="M15 9h24c11.6 0 20 7.5 20 18.2C59 38.6 50.7 46 39 46H29v9H15V9Z" fill="url(#paperMarkGradient)"/><path d="M15 9 31 22v24L15 55V9Z" fill="url(#paperFoldGradient)"/><path d="M31 22h9.3c3.4 0 5.7 2 5.7 5.2 0 3.1-2.3 5.1-5.7 5.1H31V22Z" fill="#071019" opacity=".95"/></svg>
}

function MiniBars({token}:{token:MarketToken}){
  const base=Math.max(18,Math.min(86,50+Number(token.priceChange5m||0)*2.4))
  const vals=[.68,.76,.62,.85,.73,.9,.81,1].map((m,i)=>Math.max(12,Math.min(96,base*m+(i-3)*2)))
  return <span className="paper-mini-bars" aria-hidden="true">{vals.map((v,i)=><i key={i} style={{height:`${v}%`}}/>)}</span>
}

export default function LandingHome(){
  const [tokens,setTokens]=useState<MarketToken[]>([]),[source,setSource]=useState('market feed'),[status,setStatus]=useState<'LIVE'|'DEGRADED'|'LOADING'>('LOADING'),[active,setActive]=useState(0)
  useEffect(()=>{let mounted=true,busy=false;async function load(){if(busy||document.hidden)return;busy=true;try{const r=await fetch('/api/market/latest',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'feed unavailable');if(!mounted)return;setTokens(Array.isArray(j.tokens)?j.tokens:[]);setSource(String(j.source||'market feed'));setStatus(j.stale||j.warning||j.live===false?'DEGRADED':'LIVE')}catch{if(mounted)setStatus('DEGRADED')}finally{busy=false}}void load();const feed=window.setInterval(load,8000),rotate=window.setInterval(()=>setActive(v=>v+1),5200);const visible=()=>{if(!document.hidden)void load()};document.addEventListener('visibilitychange',visible);return()=>{mounted=false;clearInterval(feed);clearInterval(rotate);document.removeEventListener('visibilitychange',visible)}},[])
  const ranked=useMemo(()=>[...tokens].filter(t=>Number(t.priceUsd)>0).sort((a,b)=>hotScore(b)-hotScore(a)).slice(0,8),[tokens])
  const hero=ranked.length?ranked[active%ranked.length]:null
  const totalVolume=ranked.reduce((n,t)=>n+Number(t.volume5m||0),0)

  return <main className="paper-landing">
    <div className="paper-ambient paper-ambient-a"/><div className="paper-ambient paper-ambient-b"/><div className="paper-grid"/>
    <header className="paper-nav">
      <Link href="/" className="paper-brand"><span className="paper-brand-mark"><PaperMark/></span><span>PAPER</span></Link>
      <nav className="paper-nav-links"><Link href="/discover">Discover</Link><Link href="/spot">Spot</Link><Link href="/pulse">Pulse</Link><Link href="/portfolio">Portfolio</Link><Link href="/profile">Profile</Link></nav>
      <Link href="/spot" className="paper-nav-cta">Open Spot <ArrowUpRight size={15}/></Link>
    </header>

    <section className="paper-hero">
      <div className="paper-hero-copy">
        <div className="paper-kicker"><span className={`paper-live-dot ${status.toLowerCase()}`}/>{status==='LOADING'?'CONNECTING TO MARKETS':`${status} · REAL MARKET DATA`}</div>
        <h1><span>TRADE PAPER.</span><strong>LEARN FAST.</strong></h1>
        <p className="paper-hero-lead">Start with <b>1,000 PAPER SOL</b> and practice on real Solana memecoin market conditions with simulated execution. No wallet. No deposits. No real-money trades.</p>
        <div className="paper-hero-actions"><Link href="/spot" className="paper-primary-btn"><Zap size={18}/> START TRADING</Link><Link href="/pulse" className="paper-secondary-btn"><Activity size={18}/> WATCH PULSE</Link></div>
        <div className="paper-proof-row"><span><Check size={14}/>1,000 PAPER SOL bankroll</span><span><Check size={14}/>Solana market feeds</span><span><Check size={14}/>Server-side simulated fills</span></div>
      </div>

      <div className="paper-hero-visual">
        <div className="paper-orbit paper-orbit-one"/><div className="paper-orbit paper-orbit-two"/>
        <div className="paper-hero-mark"><PaperMark/></div>
        <div className="paper-live-card">
          <div className="paper-live-card-top"><span>MARKET NOW</span><small>{source.toUpperCase()}</small></div>
          {hero?<>
            <div className="paper-live-token"><span className="paper-live-avatar">{hero.image?<img src={hero.image} alt=""/>:hero.symbol.slice(0,2)}</span><span><b>${hero.symbol}</b><small>{hero.name}</small></span><strong className={Number(hero.priceChange5m||0)>=0?'up':'down'}>{pct(hero.priceChange5m)}</strong></div>
            <div className="paper-live-price"><span><small>PRICE</small><b>{money(hero.priceUsd)}</b></span><MiniBars token={hero}/></div>
            <div className="paper-live-metrics"><span><small>LIQUIDITY</small><b>{money(hero.liquidityUsd)}</b></span><span><small>5M VOLUME</small><b>{money(hero.volume5m||0)}</b></span><span><small>5M TXNS</small><b>{Number(hero.buys5m||0)+Number(hero.sells5m||0)}</b></span></div>
            <Link href={`/spot?mint=${encodeURIComponent(hero.mint)}`} className="paper-open-token">OPEN ${hero.symbol} IN PAPER <ArrowUpRight size={14}/></Link>
          </>:<div className="paper-market-skeleton"><i/><i/><i/><i/></div>}
        </div>
        <div className="paper-float-chip paper-chip-one"><ShieldCheck size={15}/><span><b>PAPER ONLY</b><small>No on-chain trade submitted</small></span></div>
        <div className="paper-float-chip paper-chip-two"><BarChart3 size={15}/><span><b>REAL FEED</b><small>Fake money, real conditions</small></span></div>
      </div>
    </section>

    <section className="paper-marquee" aria-label="PAPER principles"><div>{Array.from({length:2}).map((_,group)=><span key={group}>SOLANA MEMECOINS <i/> PAPER SOL <i/> NO WALLET <i/> NO DEPOSITS <i/> SIMULATED EXECUTION <i/> PAPER-ONLY BETA <i/></span>)}</div></section>

    <section className="paper-manifesto paper-section">
      <div className="paper-section-tag">THE IDEA</div>
      <h2>THE MARKET IS REAL.<br/><span>YOUR MONEY ISN&apos;T.</span></h2>
      <p>Memecoin markets move fast. PAPER lets you build pattern recognition, test conviction and review your decisions without paying tuition to the market every time you&apos;re wrong.</p>
      <div className="paper-number-grid"><article><strong>01</strong><h3>SPOT</h3><p>Review Solana memecoin markets and submit simulated PAPER SOL buys and sells.</p></article><article><strong>02</strong><h3>PULSE</h3><p>Watch fast-moving Solana memecoin markets with explicit live or degraded data states.</p></article><article><strong>03</strong><h3>PROFILE</h3><p>Manage your PAPER identity and recovery settings without connecting a trading wallet.</p></article></div>
    </section>

    <section className="paper-market-wall paper-section">
      <div className="paper-market-wall-head"><div><div className="paper-section-tag">LIVE RIGHT NOW</div><h2>MARKETS DON&apos;T WAIT.<br/><span>NEITHER SHOULD YOU.</span></h2></div><div className="paper-market-wall-stat"><small>VISIBLE 5M VOLUME</small><b>{money(totalVolume)}</b><span>{ranked.length?`${ranked.length} live markets sampled`:'Connecting…'}</span></div></div>
      <div className="paper-token-grid">{ranked.slice(0,6).map((t,i)=><Link href={`/spot?mint=${encodeURIComponent(t.mint)}`} key={t.mint} className="paper-token-card"><div className="paper-token-card-top"><span className="paper-token-avatar">{t.image?<img src={t.image} alt=""/>:t.symbol.slice(0,2)}</span><span><b>${t.symbol}</b><small>{t.name}</small></span><em>0{i+1}</em></div><div className="paper-token-card-price"><b>{money(t.priceUsd)}</b><span className={Number(t.priceChange5m||0)>=0?'up':'down'}>{pct(t.priceChange5m)}</span></div><MiniBars token={t}/><div className="paper-token-card-bottom"><span><small>LIQ</small>{money(t.liquidityUsd)}</span><span><small>VOL 5M</small>{money(t.volume5m||0)}</span><ArrowUpRight size={15}/></div></Link>)}</div>
      <div className="paper-market-wall-action"><Link href="/pulse">OPEN LIVE PULSE <ArrowUpRight size={16}/></Link></div>
    </section>

    <section className="paper-split paper-section">
      <div className="paper-split-copy"><div className="paper-section-tag">BUILT DIFFERENT</div><h2>NO WALLET.<br/>NO DEPOSIT.<br/><span>NO PRETENDING.</span></h2><p>PAPER never asks you to fund a trading account or sign an on-chain trade. Memecoins can rug, become illiquid, or lose all real-world value. Bad coin performance does not create a payout, refund, reimbursement, or make-good.</p><Link href="/legal" className="paper-text-link">READ HOW PAPER WORKS <ArrowUpRight size={14}/></Link></div>
      <div className="paper-truth-stack"><article><Eye/><span><b>REAL MARKET INPUTS</b><small>External providers can be delayed, wrong, or unavailable.</small></span></article><article><ShieldCheck/><span><b>SIMULATED EXECUTION</b><small>PAPER SOL only — no blockchain trade is submitted.</small></span></article><article><Activity/><span><b>HIGH-RISK MARKETS</b><small>Rugs, honeypots, freezes, manipulation, and total loss can occur in real markets.</small></span></article><article><Check/><span><b>NO REIMBURSEMENT</b><small>Bad market outcomes do not create a refund, payout, or make-good obligation.</small></span></article></div>
    </section>

    <section className="paper-final-cta paper-section"><div className="paper-final-mark"><PaperMark/></div><div className="paper-section-tag">PAPER-ONLY BETA</div><h2>PRACTICE FIRST.<br/><span>RISK NOTHING.</span></h2><p>Use PAPER SOL to practice against real Solana market inputs.</p><Link href="/spot" className="paper-primary-btn"><Zap size={18}/> START WITH 1,000 PAPER SOL</Link></section>

  </main>
}
