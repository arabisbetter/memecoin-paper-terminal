import { ImageResponse } from 'next/og'

export const runtime='edge'
export const alt='PAPER — Solana memecoin paper trading'
export const size={width:1200,height:630}
export const contentType='image/png'

export default function Image(){
  return new ImageResponse(<div style={{width:'100%',height:'100%',display:'flex',position:'relative',overflow:'hidden',background:'#05070a',color:'#f7fbff',fontFamily:'Arial, Helvetica, sans-serif'}}>
    <div style={{position:'absolute',inset:0,display:'flex',background:'radial-gradient(circle at 82% 18%, rgba(61,126,255,.28), transparent 28%), radial-gradient(circle at 72% 76%, rgba(128,77,255,.18), transparent 30%), #05070a'}}/>
    <div style={{position:'absolute',inset:0,opacity:.18,backgroundImage:'linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px, transparent 1px)',backgroundSize:'54px 54px'}}/>
    <div style={{display:'flex',flexDirection:'column',justifyContent:'space-between',padding:'56px 66px',width:'100%',zIndex:2}}>
      <div style={{display:'flex',alignItems:'center',gap:16,fontSize:24,fontWeight:900,letterSpacing:'0.18em'}}><div style={{width:48,height:48,borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#8ef6ff,#3c8cff 48%,#955cff)',color:'#06111c',fontSize:34,fontWeight:900}}>P</div>PAPER</div>
      <div style={{display:'flex',flexDirection:'column',gap:16,maxWidth:920}}><div style={{fontSize:88,lineHeight:.88,fontWeight:900,letterSpacing:'-0.06em'}}>TRADE PAPER.</div><div style={{fontSize:88,lineHeight:.88,fontWeight:900,letterSpacing:'-0.06em',color:'#70c7ff'}}>LEARN FAST.</div><div style={{marginTop:16,fontSize:27,color:'#aab6c5'}}>1,000 PAPER SOL · SOLANA MEMECOINS · NO WALLET</div></div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:18,color:'#7f8b9a'}}><span>Real market data. Simulated execution.</span><span style={{color:'#42edaf'}}>PAPER ONLY</span></div>
    </div>
    <div style={{position:'absolute',right:55,top:118,width:235,height:235,border:'1px solid rgba(126,182,255,.25)',borderRadius:999}}/><div style={{position:'absolute',right:100,top:163,width:145,height:145,border:'1px dashed rgba(126,182,255,.3)',borderRadius:999}}/>
  </div>,size)
}
