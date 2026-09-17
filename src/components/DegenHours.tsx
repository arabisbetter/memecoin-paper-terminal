'use client'

type ClosedPosition={closed_at:string|null;realized_pnl_usd:number|null}
type Cell={sum:number;count:number;avg:number}
const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const money=(n:number)=>`${n>=0?'+':''}$${Math.abs(n).toFixed(2)}`

export default function DegenHours({positions}:{positions:ClosedPosition[]}){
  const grid=Array.from({length:7},()=>Array.from({length:24},()=>({sum:0,count:0,avg:0} as Cell)))
  let total=0,count=0
  for(const p of positions){if(!p.closed_at)continue;const value=Number(p.realized_pnl_usd||0),d=new Date(p.closed_at);if(Number.isNaN(d.getTime()))continue;const cell=grid[d.getDay()][d.getHours()];cell.sum+=value;cell.count+=1;total+=value;count+=1}
  const cells:Cell[]=[]
  for(const row of grid)for(const cell of row){cell.avg=cell.count?cell.sum/cell.count:0;if(cell.count)cells.push(cell)}
  const maxAbs=Math.max(1,...cells.map(c=>Math.abs(c.avg))),best=cells.length?[...cells].sort((a,b)=>b.avg-a.avg)[0]:null,worst=cells.length?[...cells].sort((a,b)=>a.avg-b.avg)[0]:null
  const locate=(target:Cell|null)=>{if(!target)return'—';for(let d=0;d<7;d++)for(let h=0;h<24;h++)if(grid[d][h]===target)return`${days[d]} ${h===0?'12 AM':h<12?`${h} AM`:h===12?'12 PM':`${h-12} PM`}`;return'—'}
  return <section className="degen-hours-card"><div className="portfolio-panel-head"><div><b>DEGEN HOURS</b><span>Average realized PAPER P&amp;L by the hour each position was closed</span></div><small>{count} closed position{count===1?'':'s'}</small></div><div className="degen-scroll"><div className="degen-grid"><div className="degen-corner"/>{Array.from({length:24},(_,h)=><div className="degen-hour" key={h}>{h%3===0?(h===0?'12a':h<12?`${h}a`:h===12?'12p':`${h-12}p`):''}</div>)}{days.map((day,d)=><div className="degen-row" key={day} style={{display:'contents'}}><div className="degen-day">{day}</div>{grid[d].map((cell,h)=>{const strength=cell.count?Math.max(.14,Math.min(.85,Math.abs(cell.avg)/maxAbs)):.04,background=cell.count?(cell.avg>=0?`rgba(45,224,176,${strength})`:`rgba(255,63,128,${strength})`):'rgba(255,255,255,.025)';return <div key={h} className="degen-cell" style={{background}} title={cell.count?`${day} ${h}:00 · ${cell.count} close${cell.count===1?'':'s'} · avg ${money(cell.avg)}`:'No closed positions'}>{cell.count?<span>{cell.avg>=0?'+':''}{cell.avg.toFixed(Math.abs(cell.avg)>=10?0:1)}</span>:null}</div>})}</div>)}</div></div><div className="degen-summary"><div><small>BEST HOUR</small><b className="gain">{locate(best)}</b><span>{best?money(best.avg):'—'}/close</span></div><div><small>WORST HOUR</small><b className="loss">{locate(worst)}</b><span>{worst?money(worst.avg):'—'}/close</span></div><div><small>AVERAGE</small><b className={total>=0?'gain':'loss'}>{count?money(total/count):'—'}</b><span>per closed position</span></div></div></section>
}
