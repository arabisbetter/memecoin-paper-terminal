import Link from 'next/link'

export default function NotFound(){
  return <main className="fatal-state"><div><span>▲ PAPER</span><h1>Market page not found.</h1><p>The route or token page you requested does not exist here.</p><Link href="/">Back to Spot</Link></div></main>
}
