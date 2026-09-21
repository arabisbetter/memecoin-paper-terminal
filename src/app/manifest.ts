import type { MetadataRoute } from 'next'

export default function manifest():MetadataRoute.Manifest{
  return {
    name:'PAPER — Solana memecoin paper trading',
    short_name:'PAPER',
    description:'PAPER-only Solana memecoin practice with simulated PAPER SOL.',
    id:'/',
    start_url:'/',
    scope:'/',
    display:'standalone',
    background_color:'#05070a',
    theme_color:'#05070a',
    categories:['finance','productivity'],
    shortcuts:[
      {name:'Spot',short_name:'Spot',url:'/spot',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml'}]},
      {name:'Pulse',short_name:'Pulse',url:'/pulse',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml'}]},
      {name:'Profile',short_name:'Profile',url:'/profile',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml'}]},
    ],
    icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml'}],
  }
}
