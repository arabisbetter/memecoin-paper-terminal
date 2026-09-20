'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, LayoutGrid, Save, Trash2 } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import CandleChart from '@/components/CandleChart'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

type Slot={mint:string;token:MarketToken|null}
type Saved={id:string;name:string;layout:{mints?:string[];count?:number}}
const blank=():Slot=>({mint:'',token:null})

export default function WorkspacesPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [slots,setSlots]=useState<Slot[]>([blank(),blank(),blank(),blank()]),[layout,setLayout]=useState<2|4>(4),[saved,setSaved]=useState<Saved[]>([]),[name,setName]=useState('Research layout'),[error,setError]=useState('')
  const slotSeq=useRef([0,0,0,0]),applySeq=useRef(0)
  async function loadSaved(){if(!supabase)return;try{const u=await ensurePaperUser(supabase);const {data}=await supabase.from('paper_workspaces').select('id,name,layout').eq('user_id',u.id).order('updated_at',{ascending:false});setSaved((data||[]) as Saved[])}catch{}}
  useEffect(()=>{const start=window.setTimeout(()=>void loadSaved(),0);return()=>clearTimeout(start)},[])
  async function setMint(i:number,mint:string){
    const clean=mint.trim(),seq=++slotSeq.current[i]
    setSlots(v=>v.map((s,x)=>x===i?{...s,mint:clean,token:null}:s))
    if(!clean){setError('');return}
    try{
      const r=await fetch('/api/market/token/'+encodeURIComponent(clean),{cache:'no-store'}),j=await r.json()
      if(!r.ok||!j.token)throw new Error(j.error||'Token not found')
      if(seq!==slotSeq.current[i])return
      setSlots(v=>v.map((s,x)=>x===i?{mint:j.token.mint,token:j.token}:s));setError('')
    }catch(e){if(seq===slotSeq.current[i])setError(e instanceof Error?e.message:'Token not found')}
  }
  async function save(e:FormEvent){e.preventDefault();if(!supabase)return;try{const u=await ensurePaperUser(supabase);const {error}=await supabase.from('paper_workspaces').upsert({user_id:u.id,name:name.trim()||'Workspace',layout:{mints:slots.map(s=>s.mint),count:layout},updated_at:new Date().toISOString()},{onConflict:'user_id,name'});if(error)throw error;await loadSaved()}catch(e){setError(e instanceof Error?e.message:'Could not save workspace')}}
  async function apply(w:Saved){
    const seq=++applySeq.current,m=w.layout?.mints||[]
    setLayout(w.layout?.count===2?2:4)
    const resolved=await Promise.all([0,1,2,3].map(async i=>{
      const mint=m[i]||''
      if(!mint)return blank()
      try{const r=await fetch('/api/market/token/'+encodeURIComponent(mint),{cache:'no-store'}),j=await r.json();return r.ok&&j.token?{mint:j.token.mint,token:j.token}:{mint,token:null}}catch{return{mint,token:null}}
    }))
    if(seq===applySeq.current)setSlots(resolved)
  }
  async function remove(id:string){if(!supabase)return;try{const u=await ensurePaperUser(supabase);const {error}=await supabase.from('paper_workspaces').delete().eq('id',id).eq('user_id',u.id);if(error)throw error;setError('');await loadSaved()}catch(e){setError(e instanceof Error?e.message:'Could not delete workspace')}}
  return <div className="ax-app"><AppHeader active="spot"/><main className="terminal-page"><div className="terminal-page-inner"><div className="final-page-hero"><div><div className="terminal-eyebrow">MULTI-CHART WORKSPACES</div><h1>Watch the market your way.</h1><p className="terminal-lead">Run two or four PAPER charts together and save named layouts for research, launches or active positions.</p></div><LayoutGrid size={28}/></div><div className="workspace-toolbar"><button className={layout===2?'active':''} onClick={()=>setLayout(2)}>2 CHARTS</button><button className={layout===4?'active':''} onClick={()=>setLayout(4)}>4 CHARTS</button><form onSubmit={save}><input value={name} onChange={e=>setName(e.target.value)} maxLength={48}/><button><Save size={12}/> Save</button></form></div>{error&&<div className="error-card">{error}</div>}<section className={'multi-chart-grid count-'+layout}>{slots.slice(0,layout).map((s,i)=><article key={i} className="multi-chart-card"><input value={s.mint} onChange={e=>setSlots(v=>v.map((q,x)=>x===i?{...q,mint:e.target.value}:q))} onBlur={()=>void setMint(i,slots[i].mint)} onKeyDown={e=>{if(e.key==='Enter')void setMint(i,slots[i].mint)}} placeholder={'Chart '+(i+1)+' · paste Solana CA'}/>{s.token?<><button className="multi-chart-popout" onClick={()=>window.open('/spot?mint='+encodeURIComponent(s.token!.mint),'_blank','noopener,noreferrer')} title="Open in separate window"><ExternalLink size={12}/> POP OUT</button><div className="multi-chart-body"><CandleChart poolAddress={s.token.pairAddress} currentPrice={s.token.priceUsd} currentMarketCap={s.token.marketCap} symbol={s.token.symbol} venue={s.token.dexId}/></div></>:<div className="empty-card">Paste a CA to load chart {i+1}.</div>}</article>)}</section><section className="saved-workspaces"><div className="panel-title"><b>SAVED WORKSPACES</b><span>{saved.length}</span></div>{saved.map(w=><div className="saved-workspace-row" key={w.id}><button onClick={()=>void apply(w)}><b>{w.name}</b><small>{(w.layout?.mints||[]).filter(Boolean).length} tokens</small></button><button aria-label={'Delete workspace '+w.name} onClick={()=>void remove(w.id)}><Trash2 size={12}/></button></div>)}</section></div></main><BottomDock active="spot"/></div>
}
