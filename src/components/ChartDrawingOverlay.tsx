'use client'

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'

export type DrawingTool='none'|'trend'|'ray'|'rectangle'|'fib'
type Point={time:number;price:number}
type Drawing={id:string;type:Exclude<DrawingTool,'none'>;mode:string;quote:string;start:Point;end:Point}
type XY={x:number;y:number}
type RenderRow={drawing:Drawing;a:XY;b:XY;width:number}
const KEY='paper.chart.drawings.v1'

function validDrawing(value:any):value is Drawing{
  return Boolean(value&&typeof value.id==='string'&&['trend','ray','rectangle','fib'].includes(value.type)&&Number(value.start?.time)>0&&Number(value.start?.price)>0&&Number(value.end?.time)>0&&Number(value.end?.price)>0)
}

export default function ChartDrawingOverlay({
  chartRef,seriesRef,mode,quote,tool,onToolChange,clearSignal
}:{
  chartRef:{current:IChartApi|null}
  seriesRef:{current:ISeriesApi<'Candlestick'>|null}
  mode:string
  quote:string
  tool:DrawingTool
  onToolChange:(tool:DrawingTool)=>void
  clearSignal:number
}){
  const svgRef=useRef<SVGSVGElement|null>(null)
  const [drawings,setDrawings]=useState<Drawing[]>([])
  const [draftStart,setDraftStart]=useState<Point|null>(null)
  const [draftEnd,setDraftEnd]=useState<Point|null>(null)
  const [version,setVersion]=useState(0)
  const [rendered,setRendered]=useState<RenderRow[]>([])
  const [renderedDraft,setRenderedDraft]=useState<RenderRow|null>(null)
  const hydrated=useRef(false)

  useEffect(()=>{
    const start=window.setTimeout(()=>{try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved))setDrawings(saved.filter(validDrawing).slice(-100))}catch{}hydrated.current=true},0)
    return()=>clearTimeout(start)
  },[])
  useEffect(()=>{
    if(hydrated.current)localStorage.setItem(KEY,JSON.stringify(drawings.slice(-100)))
  },[drawings])
  useEffect(()=>{
    if(clearSignal<=0)return
    const start=window.setTimeout(()=>{setDrawings([]);setDraftStart(null);setDraftEnd(null)},0)
    return()=>clearTimeout(start)
  },[clearSignal])
  useEffect(()=>{
    const chart=chartRef.current
    if(!chart)return
    const update=()=>setVersion(v=>v+1)
    chart.timeScale().subscribeVisibleLogicalRangeChange(update)
    const node=svgRef.current
    const observer=node?new ResizeObserver(update):null
    if(node)observer?.observe(node)
    return()=>{chart.timeScale().unsubscribeVisibleLogicalRangeChange(update);observer?.disconnect()}
  },[chartRef])
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setDraftStart(null);setDraftEnd(null);onToolChange('none')}}
    window.addEventListener('keydown',key)
    return()=>window.removeEventListener('keydown',key)
  },[onToolChange])

  const pointFromEvent=(event:ReactPointerEvent<SVGSVGElement>):Point|null=>{
    const svg=svgRef.current,chart=chartRef.current,series=seriesRef.current
    if(!svg||!chart||!series)return null
    const rect=svg.getBoundingClientRect()
    const x=event.clientX-rect.left,y=event.clientY-rect.top
    const time=chart.timeScale().coordinateToTime(x)
    const price=series.coordinateToPrice(y)
    if(time==null||price==null||!Number.isFinite(Number(price))||Number(price)<=0)return null
    return{time:Number(time),price:Number(price)}
  }

  const toXY=(point:Point):XY|null=>{
    const chart=chartRef.current,series=seriesRef.current
    if(!chart||!series)return null
    const x=chart.timeScale().timeToCoordinate(point.time as UTCTimestamp)
    const y=series.priceToCoordinate(point.price)
    if(x==null||y==null)return null
    return{x:Number(x),y:Number(y)}
  }

  function down(event:ReactPointerEvent<SVGSVGElement>){
    if(tool==='none')return
    const point=pointFromEvent(event)
    if(!point)return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraftStart(point);setDraftEnd(point)
  }
  function move(event:ReactPointerEvent<SVGSVGElement>){
    if(tool==='none'||!draftStart)return
    const point=pointFromEvent(event)
    if(point)setDraftEnd(point)
  }
  function up(event:ReactPointerEvent<SVGSVGElement>){
    if(tool==='none'||!draftStart)return
    const point=pointFromEvent(event)||draftEnd
    if(point&&Math.abs(point.time-draftStart.time)+Math.abs(point.price-draftStart.price)>0){
      setDrawings(rows=>[...rows,{id:crypto.randomUUID(),type:tool,mode,quote,start:draftStart,end:point}].slice(-100))
    }
    setDraftStart(null);setDraftEnd(null)
    onToolChange('none')
    try{event.currentTarget.releasePointerCapture(event.pointerId)}catch{}
  }

  useEffect(()=>{
    const start=window.setTimeout(()=>{
      const width=svgRef.current?.clientWidth||1000
      const rows=drawings.filter(d=>d.mode===mode&&d.quote===quote).map(d=>{const a=toXY(d.start),b=toXY(d.end);return a&&b?{drawing:d,a,b,width}:null}).filter((v):v is RenderRow=>Boolean(v))
      setRendered(rows)
      const draft=draftStart&&draftEnd&&tool!=='none'?{id:'draft',type:tool,mode,quote,start:draftStart,end:draftEnd} as Drawing:null
      if(draft){const a=toXY(draft.start),b=toXY(draft.end);setRenderedDraft(a&&b?{drawing:draft,a,b,width}:null)}else setRenderedDraft(null)
    },0)
    return()=>clearTimeout(start)
  },[drawings,draftStart,draftEnd,tool,mode,quote,version])

  const renderDrawing=(row:RenderRow)=>{
    const {drawing,a,b,width}=row
    const common={stroke:'#8ea66a',strokeWidth:1.25,fill:'none',opacity:.92}
    if(drawing.type==='trend')return <line key={drawing.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...common}/>
    if(drawing.type==='ray'){
      const dx=b.x-a.x||1,dy=b.y-a.y
      const targetX=dx>=0?width:0
      const targetY=a.y+dy*((targetX-a.x)/dx)
      return <line key={drawing.id} x1={a.x} y1={a.y} x2={targetX} y2={targetY} {...common}/>
    }
    if(drawing.type==='rectangle'){
      return <rect key={drawing.id} x={Math.min(a.x,b.x)} y={Math.min(a.y,b.y)} width={Math.abs(b.x-a.x)} height={Math.abs(b.y-a.y)} stroke="#7d8aff" strokeWidth="1.15" fill="rgba(97,121,255,.08)"/>
    }
    const ratios=[0,.236,.382,.5,.618,.786,1]
    return <g key={drawing.id}>{ratios.map(r=>{
      const y=a.y+(b.y-a.y)*r
      return <g key={r}><line x1={Math.min(a.x,b.x)} y1={y} x2={Math.max(a.x,b.x)} y2={y} stroke={r===0||r===1?'#b48a55':'#7e8ba1'} strokeWidth={r===0||r===1?1.2:.85} opacity=".86"/><text x={Math.max(a.x,b.x)+4} y={y-2} fill="#778398" fontSize="8">{r.toFixed(3)}</text></g>
    })}</g>
  }

  return <svg
    ref={svgRef}
    className={'chart-drawing-overlay '+(tool!=='none'?'drawing-active':'')}
    onPointerDown={down}
    onPointerMove={move}
    onPointerUp={up}
    aria-label="Chart drawing layer"
  >
    {rendered.map(renderDrawing)}
    {renderedDraft&&renderDrawing(renderedDraft)}
    {tool!=='none'&&<text x="10" y="18" fill="#9aaa7b" fontSize="9" fontWeight="700">{tool.toUpperCase()} · click-drag to draw · Esc cancels</text>}
  </svg>
}
