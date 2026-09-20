'use client'

import { useEffect } from 'react'
import { Filter, RotateCcw, X } from 'lucide-react'
import { activeFilterCount, defaultMarketFilters, type MarketFilters } from '@/lib/market-filters'

export default function MarketFilterDrawer({open,filters,onChange,onClose}:{open:boolean;filters:MarketFilters;onChange:(next:MarketFilters)=>void;onClose:()=>void}){
  useEffect(()=>{
    if(!open)return
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()}
    window.addEventListener('keydown',key)
    return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',key)}
  },[open,onClose])
  if(!open)return null
  const count=activeFilterCount(filters)
  const set=<K extends keyof MarketFilters,>(key:K,value:MarketFilters[K])=>onChange({...filters,[key]:value})
  return <div className="market-filter-overlay" role="dialog" aria-modal="true" aria-label="Market filters" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><aside className="market-filter-drawer"><div className="filter-drawer-head"><div><Filter size={15}/><span><b>Discover Filters</b><small>{count?`${count} active filter${count===1?'':'s'}`:'Live market filters'}</small></span></div><button aria-label="Close filters" onClick={onClose}><X size={16}/></button></div>
    <section><h3>Keywords</h3><label><span>Include</span><input value={filters.include} onChange={e=>set('include',e.target.value)} placeholder="dog, cat, ai"/></label><label><span>Exclude</span><input value={filters.exclude} onChange={e=>set('exclude',e.target.value)} placeholder="spam, test"/></label></section>
    <section><h3>Metrics</h3><div className="filter-two"><label><span>Min market cap</span><input type="number" min="0" value={filters.minMarketCap||''} onChange={e=>set('minMarketCap',Math.max(0,Number(e.target.value)||0))} placeholder="0"/></label><label><span>Max market cap</span><input type="number" min="0" value={filters.maxMarketCap||''} onChange={e=>set('maxMarketCap',Math.max(0,Number(e.target.value)||0))} placeholder="No max"/></label></div><div className="filter-two"><label><span>Min liquidity</span><input type="number" min="0" value={filters.minLiquidity||''} onChange={e=>set('minLiquidity',Math.max(0,Number(e.target.value)||0))}/></label><label><span>Min 5m volume</span><input type="number" min="0" value={filters.minVolume5m||''} onChange={e=>set('minVolume5m',Math.max(0,Number(e.target.value)||0))}/></label></div><div className="filter-two"><label><span>Min 5m txns</span><input type="number" min="0" value={filters.minTx5m||''} onChange={e=>set('minTx5m',Math.max(0,Number(e.target.value)||0))}/></label><label><span>Max age (minutes)</span><input type="number" min="0" value={filters.maxAgeMinutes||''} onChange={e=>set('maxAgeMinutes',Math.max(0,Number(e.target.value)||0))} placeholder="No max"/></label></div></section>
    <section><h3>Socials & momentum</h3><label className="filter-check"><span>Has website</span><input type="checkbox" checked={filters.requireWebsite} onChange={e=>set('requireWebsite',e.target.checked)}/></label><label className="filter-check"><span>Has X</span><input type="checkbox" checked={filters.requireX} onChange={e=>set('requireX',e.target.checked)}/></label><label className="filter-check"><span>Has Telegram</span><input type="checkbox" checked={filters.requireTelegram} onChange={e=>set('requireTelegram',e.target.checked)}/></label><label className="filter-check"><span>Positive 5m momentum</span><input type="checkbox" checked={filters.positive5m} onChange={e=>set('positive5m',e.target.checked)}/></label></section>
    <div className="filter-drawer-foot"><button className="filter-reset" onClick={()=>onChange(defaultMarketFilters)}><RotateCcw size={13}/> Reset</button><button className="filter-apply" onClick={onClose}>Apply filters</button></div></aside></div>
}
