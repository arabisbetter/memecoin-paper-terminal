import type { MetadataRoute } from 'next'

const origin='https://memecoin-paper-terminal.vercel.app'

export default function robots():MetadataRoute.Robots{
  return {
    rules:{userAgent:'*',allow:'/'},
    sitemap:`${origin}/sitemap.xml`,
    host:origin,
  }
}
