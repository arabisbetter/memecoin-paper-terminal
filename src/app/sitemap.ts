import type { MetadataRoute } from 'next'

const origin='https://memecoin-paper-terminal.vercel.app'

export default function sitemap():MetadataRoute.Sitemap{
  const routes=['/','/spot','/pulse','/profile','/legal']
  return routes.map((path,index)=>({
    url:`${origin}${path}`,
    lastModified:new Date(),
    changeFrequency:path==='/'?'daily':path==='/legal'?'monthly':'daily',
    priority:path==='/'?1:index<6?.9:.7,
  }))
}
