import { ExternalLink, Gift, HeartHandshake, ShieldCheck, Sparkles } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'

export const dynamic='force-dynamic'

export default function CoinPage(){
  const symbol=process.env.NEXT_PUBLIC_PROJECT_TOKEN_SYMBOL||'$PAPER'
  const mint=process.env.NEXT_PUBLIC_PROJECT_TOKEN_MINT||''
  const buyUrl=process.env.NEXT_PUBLIC_PROJECT_TOKEN_BUY_URL||''
  const description=process.env.NEXT_PUBLIC_PROJECT_TOKEN_DESCRIPTION||'The community memecoin for the PAPER ecosystem: a live-memecoin culture layer around the paper-trading terminal, leaderboards, giveaways and community events. It is completely separate from PAPER SOL, which is only a simulated trading balance inside this app.'
  return <div className="ax-app">
    <AppHeader active="spot"/>
    <main className="terminal-page coin-page"><div className="terminal-page-inner coin-inner">
      <section className="coin-hero"><div className="coin-orb"><Sparkles size={28}/></div><div><div className="terminal-eyebrow">COMMUNITY COIN</div><h1>{symbol}</h1><p>{description}</p><div className="coin-hero-actions">{buyUrl?<a className="coin-buy-link" href={buyUrl} target="_blank" rel="noreferrer">OFFICIAL BUY LINK <ExternalLink size={14}/></a>:<button className="coin-buy-link disabled" disabled>OFFICIAL BUY LINK COMING SOON</button>}{mint&&<code>{mint}</code>}</div><small className="coin-real-warning"><ShieldCheck size={12}/> Buying a real token uses real funds and happens outside PAPER. PAPER SOL never converts into the real token.</small></div></section>

      <section className="coin-info-grid">
        <article><Sparkles size={19}/><h2>What it is</h2><p>{symbol} is the community-facing memecoin for the project. The trading terminal itself remains PAPER-only: users can discover live Solana memecoins and simulate positions without depositing money.</p></article>
        <article><Gift size={19}/><h2>Giveaways</h2><p>Official giveaways are community promotions. Giveaway amount, eligibility, dates, geographic restrictions and winners should be published clearly for every campaign.</p></article>
        <article className="impact-card"><HeartHandshake size={19}/><h2>Dollar-for-dollar charity match</h2><p><b>Our pledge:</b> for every $1 distributed through an official PAPER giveaway, we will match it with $1 donated to charity.</p><div className="impact-example"><span>$1,000</span><small>community giveaway</small><b>+</b><span>$1,000</span><small>charity donation</small></div><p className="impact-foot">Donation totals and receipts should be published after each completed campaign so the community can verify the match.</p></article>
      </section>

      <section className="coin-transparency"><div><b>Transparent by design</b><span>Giveaway rules, winner amounts, matched donation amount, recipient charity and proof of donation should be posted together.</span></div><div><b>No confusion with PAPER balance</b><span>PAPER SOL is simulated. {symbol} is a real external token only if/when the official buy link is activated.</span></div><div><b>No purchase required for PAPER trading</b><span>The terminal and leaderboard experience stay usable without buying the community coin.</span></div></section>
    </div></main>
    <BottomDock active="coin"/>
  </div>
}
