'use client'

import { useEffect } from 'react'

export default function Error({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{console.error('paper_route_error',error)},[error])
  return <main className="fatal-state"><div><span>▲ PAPER</span><h1>This panel hit an error.</h1><p>Your PAPER account was not reset. Retry the page component or return to live markets.</p><button onClick={reset}>Retry</button><a href="/">Back to Spot</a></div></main>
}
