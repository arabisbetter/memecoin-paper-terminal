'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { GitCompareArrows, Plus, X } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import TokenRiskPanel from '@/components/TokenRiskPanel'
import type { MarketToken } from '@/lib/types'

const money=(n:number)=>n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+n.toFixed(n<1?6:2)
const isMint=(s:string)=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim())

export default function ComparePage(){
  const [input,setInput]=useState(''),[tokens,setTokens]=useState<MarketToken[]>([]),[error,setError]=useState('')
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('paper.compare.mints')||'[]');if(Array.isArray(saved))void Promise.all(saved.slice(0,4).map(async(m:string)=>{const r=await fetch('/api/market/token/'+encodeURIComponent(m),{cache:'no-store'}),j=await r.json();return r.ok?j.token:null})).then(rows=>setTokens(rows.filter(Boolean)))}catch{}},[])
  useEffect(()=>{localStorage.setItem('paper.compare.mints',JSON.stringify(tokens.map(t=>t.mint)))},[tokens])
  async function add(e:FormEvent){e.preventDefault();const mint=input.trim();if(!isMint(mint)){setError('Enter a valid Solana contract address.');return}if(tokens.some(t=>t.mint===mint)||tokens.length>=4)return;try{const r=await fetch('/api/market/token/'+encodeURIComponent(mint),{cache:'no-store'}),j=await r.json();if(!r.ok||!j.token)throw new Error(j.error||'Token not found');setTokens(v=>[...v,j.token].slice(0,4));setInput('');setError('')}catch(e){setError(e instanceof Error?e.message:'Token not found')}}
  return <div className="ax-app"><AppHeader active="spot"/><main className="terminal-page"><div className="terminal-page-inner"><div className="final-page-hero"><div><div className="terminal-eyebrow">TOKEN COMPARISON</div><h1>Compare up to four markets.</h1><p className="terminal-lead">Liquidity, volume, momentum, buy pressure and PAPER risk scans side by side.</p></div><GitCompareArrows size={28}/></div><form className="compare-add" onSubmit={add}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Paste Solana contract address"/><button disabled={tokens.length>=4}><Plus size={13}/> Add</button></form>{error&&<div className="error-card">{error}</div>}<section className="compare-grid">{tokens.map(t=>{const buys=Number(t.buys5m||0),sells=Number(t.sells5m||0),buyPct=buys/Math.max(1,buys+sells)*100;return <article className="compare-card" key={t.mint}><button className="compare-remove" onClick={()=>setTokens(v=>v.filter(x=>x.mint!==t.mint))}><X size={13}/></button><div className="compare-token"><b>{'$'+t.symbol}</b><span>{t.name}</span><Link href={'/spot?mint='+t.mint}>Open terminal →</Link></div><div className="compare-kpis"><span><small>MARKET CAP</small><b>{money(t.marketCap)}</b></span><span><small>LIQUIDITY</small><b>{money(t.liquidityUsd)}</b></span><span><small>5M VOLUME</small><b>{money(Number(t.volume5m||0))}</b></span><span><small>5M MOVE</small><b className={Number(t.priceChange5m||0)>=0?'gain':'loss'}>{Number(t.priceChange5m||0).toFixed(1)}%</b></span><span><small>BUY PRESSURE</small><b>{buyPct.toFixed(0)}%</b></span><span><small>AGE</small><b>{t.pairCreatedAt?Math.max(0,(Date.now()-t.pairCreatedAt)/3600000).toFixed(1)+'h':'—'}</b></span></div><TokenRiskPanel mint={t.mint}/></article>})}{!tokens.length&&<div className="empty-card">Add 2–4 token contract addresses to compare them.</div>}</section></div></main><BottomDock active="spot"/></div>
}
