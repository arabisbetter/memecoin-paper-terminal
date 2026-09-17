import Link from 'next/link'

const body={color:'#b8becc',lineHeight:1.8} as const
export default function LegalPage(){
  return <main style={{minHeight:'100vh',background:'#07080c',color:'#f5f6f8',padding:'48px 20px',fontFamily:'Inter,ui-sans-serif,system-ui'}}><div style={{maxWidth:900,margin:'0 auto'}}>
    <Link href="/" style={{color:'#6f86ff',textDecoration:'none'}}>← Back to PAPER</Link>
    <h1 style={{fontSize:34,margin:'24px 0 8px'}}>PAPER Legal &amp; Risk Documents</h1>
    <p style={{color:'#9198aa',lineHeight:1.7}}>Terms v2 · Privacy v1 · Risk Disclosure v2. PAPER-only trading and evaluation use simulated capital. Real funded accounts, custody, and payouts are not active until separate KYC, compliance, security, capital, and legal launch requirements are completed.</p>

    <section id="terms" style={{marginTop:44}}><h2>Terms of Service — v2</h2>
      <p style={body}><b>Age and eligibility.</b> You must be at least 18 years old to enter a PAPER evaluation. Availability may later be restricted by country, state, sanctions rules, or other legal requirements. PAPER may require a recoverable account, identity verification, or additional eligibility checks before enabling any real-funded feature.</p>
      <p style={body}><b>PAPER trading.</b> PAPER balances, simulated positions, simulated fills, points, rankings, evaluation equity, and portfolio values are software records, not deposits, brokerage assets, custody balances, or claims on real cryptocurrency. During PAPER-only trading and evaluation, no blockchain trade is submitted and no user trading funds are held by PAPER.</p>
      <p style={body}><b>Free evaluation.</b> The current evaluation starts with $1,000 PAPER, has a +$5,000 profit target ($6,000 live-equity target), a continuously trailing 10% drawdown limit, a $50 UTC daily-loss limit using realized plus unrealized P&amp;L, a 30-day window, a 25% maximum single-token/single-entry concentration, a maximum of five simultaneous open positions, and a minimum of one trade. A failed or expired attempt has a 24-hour cooldown before another free attempt. PAPER may pause evaluation trading when required live market data cannot be verified rather than substitute an invented price.</p>
      <p style={body}><b>Passing is not a promise of funding.</b> A rule-based evaluation pass may move an account into a future funded-eligibility workflow, but does not create a debt, guaranteed allocation, employment relationship, investment contract, or entitlement to real capital or payout. Real funded activation is separately gated and may require KYC/AML checks, sanctions screening, legal eligibility, capital availability, custody controls, wallet verification, and acceptance of additional funded-account terms.</p>
      <p style={body}><b>Integrity.</b> Users must not exploit bugs, automate abusive traffic, manipulate evaluation measurements, create duplicate accounts to evade limits, use coordinated/wash-style behavior, or interfere with market-data services. PAPER may freeze, suspend, or correct records after a verified technical or abuse incident and will maintain audit records for material enforcement actions.</p>
    </section>

    <section id="evaluation" style={{marginTop:44}}><h2>Evaluation Rules — v1</h2>
      <p style={body}>Evaluation equity is intended to be marked from server-verified live market prices for open positions. The trailing drawdown floor increases when live equity reaches a new high and does not move downward during that attempt. The daily-loss anchor resets at 00:00 UTC. If a required open-position market cannot be verified, PAPER may mark the evaluation data state as unavailable/degraded and pause new evaluation buys until reliable marks resume.</p>
      <p style={body}>The simulated execution engine models liquidity-sensitive impact and a 1% PAPER fee. These are simulation rules and are not a representation that an identical real transaction would have received the same route, fill, latency, priority fee, liquidity, or price impact.</p>
    </section>

    <section id="privacy" style={{marginTop:44}}><h2>Privacy Policy — v1</h2>
      <p style={body}>PAPER stores information needed to run accounts, including profile details, simulated trade history, positions, evaluation events, points, moderation records, and limited security signals used to protect the service. Anonymous PAPER-only accounts may use limited IP/device-risk signals for rate limiting and abuse review. Recovery email, payout information, IP addresses, and device signals are not public profile information.</p>
      <p style={body}>A PAPER-only anonymous account may be unrecoverable after browser storage is cleared or the device changes until a recovery method is linked. Evaluation entry currently requires a recoverable login. Future real-funded activation will require additional privacy disclosures before any KYC or payout data is collected.</p>
    </section>

    <section id="risk" style={{marginTop:44}}><h2>Risk Disclosure — v2</h2>
      <p style={body}>Memecoin markets are highly volatile, thinly traded, and vulnerable to rapid liquidity loss, smart-contract risk, concentrated ownership, manipulation, and complete loss of real-world value. PAPER is software for simulated practice and evaluation, not investment advice. A profitable PAPER result does not mean the same result could be reproduced using real money.</p>
      <p style={body}>Market feeds can be delayed, incomplete, unavailable, or inconsistent across providers. PAPER does not intentionally fabricate market activity, holder data, candles, fills, or risk labels. When reliable data is unavailable, the product should display an unavailable/degraded state or pause the affected action.</p>
      <p style={body}>Any future funded account will involve separate real-money terms and controls. Until those terms are activated, the product must not represent that a user has been allocated real capital, that a payout is owed, or that a real transaction has occurred.</p>
    </section>

    <div style={{marginTop:52,paddingTop:22,borderTop:'1px solid #222633',color:'#737b8c',fontSize:13}}>Real funded trading and payouts are feature-flagged off in the current public PAPER phase. Legal/compliance review remains unresolved and is a launch dependency for those features.</div>
  </div></main>
}
