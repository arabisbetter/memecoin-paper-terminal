const VERSION='paper-shell-v10-4'
const SHELL_CACHE=VERSION+'-shell'
const STATIC_CACHE=VERSION+'-static'
const SHELL=new Set(['/','/spot','/pulse','/portfolio','/community','/status','/manifest.webmanifest','/icon.svg'])

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll([...SHELL])).catch(()=>{}))
  self.skipWaiting()
})

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('paper-shell-')||k.startsWith('paper-static-')).filter(k=>k!==SHELL_CACHE&&k!==STATIC_CACHE).map(k=>caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch',event=>{
  const req=event.request
  if(req.method!=='GET')return
  const url=new URL(req.url)
  if(url.origin!==self.location.origin)return
  if(url.pathname.startsWith('/api/'))return

  if(req.mode==='navigate'){
    if(!SHELL.has(url.pathname))return
    event.respondWith(fetch(req).then(res=>{
      if(res.ok){const clone=res.clone();caches.open(SHELL_CACHE).then(c=>c.put(url.pathname,clone))}
      return res
    }).catch(async()=>await caches.match(url.pathname)||await caches.match('/')||Response.error()))
    return
  }

  const staticAsset=url.pathname.startsWith('/_next/static/')||url.pathname.endsWith('.svg')||url.pathname.endsWith('.png')||url.pathname.endsWith('.webp')||url.pathname.endsWith('.woff2')
  if(staticAsset){
    event.respondWith(caches.match(req).then(cached=>{
      const refresh=fetch(req).then(res=>{if(res.ok)caches.open(STATIC_CACHE).then(c=>c.put(req,res.clone()));return res}).catch(()=>cached)
      return cached||refresh
    }))
  }
})
