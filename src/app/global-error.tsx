'use client'

export default function GlobalError({reset}:{error:Error&{digest?:string};reset:()=>void}){
  return <html><body><main className="fatal-state"><div><span>▲ PAPER</span><h1>PAPER needs a reload.</h1><p>The terminal hit an unexpected client error. Your server-side PAPER account remains separate from this screen.</p><button onClick={reset}>Try again</button><button onClick={()=>{window.location.href='/'}}>Reload Spot</button></div></main></body></html>
}
