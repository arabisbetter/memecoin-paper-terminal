import Link from 'next/link'

const body={color:'#b8becc',lineHeight:1.8} as const
const draft={border:'1px solid #704c18',background:'#1d160b',color:'#f5ca79',padding:'12px 14px',borderRadius:8,lineHeight:1.6} as const

export default function LegalPage(){
  return <main style={{minHeight:'100vh',background:'#07080c',color:'#f5f6f8',padding:'48px 20px',fontFamily:'Inter,ui-sans-serif,system-ui'}}><div style={{maxWidth:900,margin:'0 auto'}}>
    <Link href="/" style={{color:'#6f86ff',textDecoration:'none'}}>← Back to PAPER</Link>
    <h1 style={{fontSize:34,margin:'24px 0 8px'}}>PAPER Legal &amp; Risk Documents</h1>
    <p style={draft}><b>DRAFT - ATTORNEY REVIEW REQUIRED.</b> These clauses are working product drafts for counsel review. They are not a claim that PAPER is immune from lawsuits, regulation, liability, or any legal obligation.</p>

    <section id="terms" style={{marginTop:44}}><h2>Terms of Service — DRAFT</h2>
      <p style={draft}><b>DRAFT - ATTORNEY REVIEW REQUIRED.</b></p>
      <p style={body}><b>Simulated-only service.</b> PAPER provides simulated trading using a virtual unit called PAPER SOL. PAPER SOL has no cash value, is not cryptocurrency, cannot be withdrawn, and does not represent custody of SOL or any other asset. The public beta does not submit blockchain trades, accept deposits, operate funded accounts, or send payouts.</p>
      <p style={body}><b>Regulatory characterization.</b> PAPER is intended as simulation software and not as a broker, exchange, investment adviser, financial adviser, fiduciary, custodian, or money transmitter. This describes intended product design and requires attorney review; it is not a legal conclusion.</p>
      <p style={body}><b>No advice.</b> Market data, risk labels, simulations, charts, rankings, and other content are informational and educational features, not investment, legal, tax, or financial advice.</p>
      <p style={body}><b>As-is service.</b> To the maximum extent permitted by applicable law, the service is provided “as is” and “as available,” without warranties that it will be uninterrupted, accurate, secure, complete, or fit for a particular purpose.</p>
      <p style={body}><b>Limitation of liability.</b> To the maximum extent permitted by applicable law, this draft would limit PAPER’s liability for indirect, incidental, consequential, special, exemplary, or punitive damages and for losses arising from third-party market data, service interruptions, or simulated outcomes. Counsel must determine enforceable scope and required carve-outs.</p>
      <p style={body}><b>Third-party data.</b> Prices, liquidity, token metadata, transaction activity, images, websites, and other market information may come from independent providers or token publishers. Such data can be delayed, incomplete, manipulated, unavailable, or wrong. PAPER does not guarantee third-party data.</p>
      <p style={body}><b>Assumption of risk.</b> Users acknowledge that real memecoin markets can involve rugs, honeypots, freezes, concentrated ownership, manipulated volume, smart-contract defects, thin liquidity, extreme volatility, and complete loss of real-world value. PAPER SOL is simulated and does not insure or hedge real-world losses.</p>
      <p style={body}><b>No reimbursement or make-good.</b> Bad coin performance, a rug, loss of liquidity, inaccurate external data, or a difference between a PAPER result and a real-market result does not by itself create a right to a payout, refund, reimbursement, replacement credit, or make-good.</p>
      <p style={body}><b>Indemnification.</b> The draft would require users, to the extent permitted by law, to indemnify PAPER for claims arising from misuse of the service, violation of the terms, infringement of third-party rights, or unlawful conduct. Counsel must review scope and enforceability.</p>
      <p style={body}><b>Dispute resolution.</b> The draft contemplates individual binding arbitration and a class-action/class-arbitration waiver where enforceable, with legally required opt-out, small-claims, injunctive-relief, and jurisdiction-specific exceptions. Final language, forum, governing law, notice mechanics, and opt-out procedure require attorney approval before use.</p>
      <p style={body}><b>Force majeure.</b> PAPER would not be responsible, to the extent permitted by law, for delay or failure caused by events beyond reasonable control, including provider outages, chain or RPC failures, cyber incidents, natural disasters, government action, labor disruptions, or widespread network failure.</p>
      <p style={body}><b>Terminate, void, correct, or reset.</b> PAPER may suspend access, void simulated activity, correct erroneous records, or reset PAPER SOL balances when reasonably necessary to address bugs, abuse, manipulated data, security incidents, testing, maintenance, or rule enforcement. Any future contest action must also follow the applicable official contest rules.</p>
      <p style={body}><b>Changes; severability; no waiver.</b> Draft terms may be revised prospectively with notice where required. If a provision is unenforceable, remaining provisions are intended to remain effective to the extent permitted by law. Failure to enforce a provision is not intended to waive later enforcement.</p>
    </section>

    <section id="privacy" style={{marginTop:44}}><h2>Privacy Policy — DRAFT</h2>
      <p style={draft}><b>DRAFT - ATTORNEY REVIEW REQUIRED.</b></p>
      <p style={body}>PAPER stores information needed to operate simulated accounts, including profile details, PAPER SOL trades and positions, legal acceptance records, limited security and abuse signals, recovery information when supplied, and operational telemetry. At acceptance, PAPER records the server-observed IP address together with document version and time for audit purposes.</p>
      <p style={body}>Anonymous accounts can become unrecoverable if browser data is cleared before a recovery method is added. Public profile information is separated from security signals such as IP and device-risk data. Data-retention and deletion rights require jurisdiction-specific review and will be expanded before broader launch.</p>
    </section>

    <section id="risk" style={{marginTop:44}}><h2>Risk Disclosure — DRAFT</h2>
      <p style={draft}><b>DRAFT - ATTORNEY REVIEW REQUIRED.</b></p>
      <p style={body}>Solana memecoins are highly speculative and may be manipulated, frozen, unsellable, rugged, or become worthless. Smart-contract and token-program behavior can prevent or impair selling. Liquidity can disappear without warning.</p>
      <p style={body}>PAPER uses external market and chain data that may be delayed, incomplete, unavailable, inconsistent, manipulated, or incorrect. A simulated fill is not evidence that a comparable real order could have been executed at the same price, size, latency, fee, route, or at all.</p>
      <p style={body}>PAPER SOL has no monetary value. The public beta has no funded accounts, custody, real-money execution, prize distribution, or payout obligation. No real-market loss is reimbursed by PAPER.</p>
    </section>

    <section id="contest" style={{marginTop:44}}><h2>Contest Rules — DRAFT / DORMANT</h2>
      <p style={draft}><b>DRAFT - ATTORNEY REVIEW REQUIRED.</b> No public prize contest is active. This section is a placeholder for future official rules and creates no prize entitlement.</p>
      <p style={body}>If a future contest is activated, it is intended to use free entry, a fixed and capped SOL prize, a UTC weekly boundary, a 1,000 PAPER SOL weekly reset, a 20-trade minimum, ranking by percentage return, and server-side tie-breaks. Eligibility, geographic restrictions, taxes, dispute terms, sanctions or KYC requirements if legally required, and final prize mechanics must be approved by counsel before activation.</p>
    </section>

    <div style={{marginTop:52,paddingTop:22,borderTop:'1px solid #222633',color:'#8f97a8',fontSize:13}}>PAPER-only beta: Spot, Pulse, and Profile. Real-money trading, funded accounts, custody, prizes, and payouts are disabled.</div>
  </div></main>
}
