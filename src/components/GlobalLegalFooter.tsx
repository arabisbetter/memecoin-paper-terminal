import Link from 'next/link'

const footerStyle={display:'flex',gap:18,alignItems:'center',justifyContent:'center',flexWrap:'wrap',padding:'18px 16px 64px',borderTop:'1px solid #222633',background:'#07080c',color:'#9aa3b5',fontSize:12} as const
const navStyle={display:'flex',gap:14,flexWrap:'wrap',justifyContent:'center'} as const

export default function GlobalLegalFooter(){
  return <footer className="global-legal-footer" aria-label="Legal links" style={footerStyle}>
    <span>PAPER-only beta · simulated PAPER SOL · no real-money trading</span>
    <nav style={navStyle}><Link href="/legal#terms">Terms</Link><Link href="/legal#privacy">Privacy</Link><Link href="/legal#risk">Risk</Link><Link href="/legal#contest">Contest Rules</Link></nav>
  </footer>
}
