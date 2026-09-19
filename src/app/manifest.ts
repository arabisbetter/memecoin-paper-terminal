import type { MetadataRoute } from 'next'

export default function manifest():MetadataRoute.Manifest{
  return {
    name:'PAPER — Trade PAPER. Earn real.',
    short_name:'PAPER',
    description:'Live Solana memecoin paper trading and free evaluation with simulated capital.',
    id:'/',
    start_url:'/',
    scope:'/',
    display:'standalone',
    background_color:'#05070a',
    theme_color:'#05070a',
    categories:['finance','productivity'],
    shortcuts:[
      {name:'Trade',short_name:'Trade',url:'/spot',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml'}]},
      {name:'Pulse',short_name:'Pulse',url:'/pulse',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml'}]},
      {name:'Community',short_name:'Community',url:'/community',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml'}]},
    ],
    icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml'}],
  }
}
