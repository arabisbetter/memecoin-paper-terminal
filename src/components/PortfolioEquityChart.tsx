'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AreaSeries, ColorType, CrosshairMode, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'

type Point={time:number;equity:number}
type Range='1D'|'7D'|'30D'|'MAX'
const ranges:Range[]=['1D','7D','30D','MAX']
const money=(n:number)=>Number.isFinite(n)?`$${n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`:'—'

export default function PortfolioEquityChart({points,startingEquity=1000}:{points:Point[];startingEquity?:number}){
  const wrap=useRef<HTMLDivElement|null>(null),chartRef=useRef<IChartApi|null>(null),seriesRef=useRef<ISeriesApi<'Area'>|null>(null)
  const [range,setRange]=useState<Range>('7D'),[hover,setHover]=useState<Point|null>(null)
  const filtered=useMemo(()=>{const ordered=[...points].filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.equity)).sort((a,b)=>a.time-b.time);if(range==='MAX'||!ordered.length)return ordered;const span=range==='1D'?86400:range==='7D'?7*86400:30*86400,cutoff=Math.floor(Date.now()/1000)-span;return ordered.filter(p=>p.time>=cutoff)},[points,range])
  const visible=filtered.length?filtered:points.slice(-1)
  const last=hover||visible[visible.length-1],first=visible[0],change=last&&first?last.equity-first.equity:0,changePct=first?.equity?change/first.equity*100:0

  useEffect(()=>{
    if(!wrap.current)return
    const chart=createChart(wrap.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#080a0f'},textColor:'#7f899c',fontSize:11},grid:{vertLines:{color:'#141821'},horzLines:{color:'#141821'}},crosshair:{mode:CrosshairMode.Normal,vertLine:{color:'#58627a',width:1,labelBackgroundColor:'#252c3a'},horzLine:{color:'#58627a',width:1,labelBackgroundColor:'#252c3a'}},rightPriceScale:{borderColor:'#1d2430',scaleMargins:{top:.12,bottom:.12}},timeScale:{borderColor:'#1d2430',timeVisible:true,secondsVisible:false,rightOffset:2,barSpacing:12,minBarSpacing:4}})
    const series=chart.addSeries(AreaSeries,{lineColor:'#6f86ff',topColor:'rgba(111,134,255,.28)',bottomColor:'rgba(111,134,255,.02)',lineWidth:2,priceLineVisible:false,lastValueVisible:true})
    series.createPriceLine({price:startingEquity,color:'#49526a',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'START'})
    chart.subscribeCrosshairMove(param=>{const value=param.seriesData.get(series) as {value?:number}|undefined;if(value&&typeof value.value==='number'&&param.time)setHover({time:Number(param.time),equity:value.value});else setHover(null)})
    chartRef.current=chart;seriesRef.current=series
    return()=>{chart.remove();chartRef.current=null;seriesRef.current=null}
  },[startingEquity])

  useEffect(()=>{if(!seriesRef.current)return;seriesRef.current.setData(visible.map(p=>({time:p.time as UTCTimestamp,value:p.equity})));chartRef.current?.timeScale().fitContent()},[visible])

  return <section className="portfolio-equity-card">
    <div className="portfolio-equity-head"><div><small>PAPER EQUITY CURVE</small><b>{last?money(last.equity):money(startingEquity)}</b><span className={change>=0?'gain':'loss'}>{change>=0?'+':''}{money(change)} · {changePct>=0?'+':''}{changePct.toFixed(2)}%</span></div><div className="portfolio-range-tabs">{ranges.map(r=><button key={r} className={range===r?'active':''} onClick={()=>setRange(r)}>{r}</button>)}</div></div>
    <div className="portfolio-equity-chart"><div ref={wrap}/>{visible.length<2&&<div className="portfolio-chart-empty">Equity snapshots are now active. The curve will build automatically as your PAPER account changes.</div>}</div>
    <div className="portfolio-equity-foot"><span>{hover?new Date(hover.time*1000).toLocaleString():'Hover the curve for a timestamp'}</span><span>{visible.length} snapshot{visible.length===1?'':'s'}</span></div>
  </section>
}
