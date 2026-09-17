import type { MetadataRoute } from 'next'

export default function manifest():MetadataRoute.Manifest{
  return {
    name:'PAPER — Trade PAPER. Earn real.',
    short_name:'PAPER',
    description:'Live Solana memecoin paper trading and free evaluation with simulated capital.',
    start_url:'/',
    display:'standalone',
    background_color:'#05070a',
    theme_color:'#05070a',
    icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml'}],
  }
}
