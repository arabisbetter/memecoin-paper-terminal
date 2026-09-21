import Link from 'next/link'
import { FileCheck2, HeartHandshake, ReceiptText, ShieldCheck } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'

export const dynamic='force-dynamic'

export default function CharityPage(){
  return <div className="ax-app">
    <AppHeader active="rewards"/>
    <main className="terminal-page coin-page"><div className="terminal-page-inner coin-inner">
      <section className="coin-hero">
        <div className="coin-orb"><HeartHandshake size={28}/></div>
        <div>
          <div className="terminal-eyebrow">PAPER CHARITY · DORMANT BETA PROGRAM</div>
          <h1>Give back, transparently.</h1>
          <p>PAPER can support charitable giving without touching user balances. The charity program is separate from PAPER SOL, trading, rankings, and account balances.</p>
          <small className="coin-real-warning"><ShieldCheck size={12}/> No user deposits, PAPER SOL, wallet funds, or trading balances are collected or transferred for charity.</small>
        </div>
      </section>

      <section className="coin-info-grid">
        <article className="impact-card">
          <HeartHandshake size={19}/>
          <h2>Dollar-for-dollar match concept</h2>
          <p><b>DRAFT - ATTORNEY REVIEW REQUIRED.</b> If an official PAPER giveaway program is activated in the future, PAPER intends to match each $1 actually distributed through that campaign with $1 donated to the named charity, subject to the final published campaign terms.</p>
          <div className="impact-example"><span>$1,000</span><small>completed campaign distribution</small><b>+</b><span>$1,000</span><small>charity donation</small></div>
          <p className="impact-foot">This concept is dormant while real prizes and payouts are OFF.</p>
        </article>
        <article>
          <ReceiptText size={19}/>
          <h2>Proof, not promises</h2>
          <p>For any activated campaign, the public record should show the campaign amount, matched amount, recipient charity, donation date, and receipt or other verifiable proof.</p>
        </article>
        <article>
          <FileCheck2 size={19}/>
          <h2>Separate from PAPER trading</h2>
          <p>Charity participation never changes PAPER balances, leaderboard standing, token eligibility, trade fills, rewards points, or account access. Users are never required to donate to use PAPER.</p>
        </article>
      </section>

      <section className="coin-transparency">
        <div><b>Real prizes remain OFF</b><span>The current beta does not issue real SOL prizes, payouts, or funded-account money.</span></div>
        <div><b>No automatic donation transfers</b><span>PAPER has no public wallet-transfer or payout path for charity. Any future donation would be handled separately and documented afterward.</span></div>
        <div><b>Review before activation</b><span>The dollar-for-dollar campaign language is a draft concept and must be reviewed before a real campaign is announced.</span></div>
      </section>

      <div className="leader-rule-note"><ShieldCheck size={12}/> Charity is informational/dormant in this beta. <Link href="/rewards">Back to PAPER Rewards →</Link></div>
    </div></main>
    <BottomDock active="charity"/>
  </div>
}
