import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

type WatchRow={
  id:string
  user_id:string
  chain_id:string
  address:string
  symbol:string|null
  alert_above_usd:number|null
  alert_below_usd:number|null
  alert_above_triggered:boolean
  alert_below_triggered:boolean
}
type Pair={chainId?:string;priceUsd?:string;liquidity?:{usd?:number}}
const finite=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback}
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})

function envKeys(){
  const url=Deno.env.get('SUPABASE_URL')
  const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
  const secret=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!secret)throw new Error('server auth configuration missing')
  return{url,secret}
}
async function heartbeat(admin:any,status:'healthy'|'degraded'|'failed',startedMs:number,details:Record<string,unknown>,error?:string){
  const now=new Date().toISOString()
  const {data:current}=await admin.from('paper_operational_heartbeats').select('consecutive_failures').eq('component','watchlist_alert_monitor').maybeSingle()
  await admin.from('paper_operational_heartbeats').upsert({
    component:'watchlist_alert_monitor',status,last_started_at:new Date(startedMs).toISOString(),
    last_success_at:status==='failed'?undefined:now,last_failure_at:status==='failed'?now:undefined,
    consecutive_failures:status==='failed'?Number(current?.consecutive_failures||0)+1:0,
    latency_ms:Math.max(0,Date.now()-startedMs),
    details:error?{...details,error:String(error).slice(0,500)}:details,updated_at:now,
  },{onConflict:'component'})
}
async function fetchJson(url:string,timeoutMs=7000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs)
  try{
    const r=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal})
    if(!r.ok)throw new Error(new URL(url).hostname+' '+r.status)
    return await r.json()
  }finally{clearTimeout(timer)}
}
async function livePrice(chain:string,address:string){
  const body=await fetchJson('https://api.dexscreener.com/token-pairs/v1/'+encodeURIComponent(chain)+'/'+encodeURIComponent(address))
  const rows=(Array.isArray(body)?body:[]) as Pair[]
  const valid=rows.filter(p=>finite(p.priceUsd)>0)
  if(!valid.length)throw new Error('no live market')
  valid.sort((a,b)=>finite(b.liquidity?.usd)-finite(a.liquidity?.usd))
  return finite(valid[0].priceUsd)
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return reply({error:'method not allowed'},405)
  const startedMs=Date.now()
  let admin:any=null
  const stats={checked:0,events:0,errors:0}
  try{
    const {url,secret}=envKeys()
    admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const token=req.headers.get('x-paper-internal-token')||''
    const {data:valid}=await admin.rpc('paper_verify_internal_token',{p_token:token})
    if(valid!==true)return reply({error:'unauthorized'},401)

    const {data:rows,error}=await admin.from('token_watchlist')
      .select('id,user_id,chain_id,address,symbol,alert_above_usd,alert_below_usd,alert_above_triggered,alert_below_triggered')
      .or('alert_above_usd.not.is.null,alert_below_usd.not.is.null')
      .order('updated_at',{ascending:true}).limit(250)
    if(error)throw new Error(error.message)

    for(const row of (rows||[]) as WatchRow[]){
      stats.checked++
      try{
        const price=await livePrice(row.chain_id,row.address)
        const above=finite(row.alert_above_usd,0)
        const below=finite(row.alert_below_usd,0)
        const hitAbove=above>0&&price>=above
        const hitBelow=below>0&&price<=below
        let aboveTriggered=Boolean(row.alert_above_triggered)
        let belowTriggered=Boolean(row.alert_below_triggered)

        if(hitAbove&&!aboveTriggered){
          const {error:eventError}=await admin.from('paper_alert_events').insert({
            user_id:row.user_id,watchlist_id:row.id,chain_id:row.chain_id,token_address:row.address,
            token_symbol:row.symbol,direction:'above',trigger_price_usd:above,observed_price_usd:price
          })
          if(eventError)throw new Error(eventError.message)
          aboveTriggered=true;stats.events++
        }else if(!hitAbove&&aboveTriggered){
          aboveTriggered=false
        }

        if(hitBelow&&!belowTriggered){
          const {error:eventError}=await admin.from('paper_alert_events').insert({
            user_id:row.user_id,watchlist_id:row.id,chain_id:row.chain_id,token_address:row.address,
            token_symbol:row.symbol,direction:'below',trigger_price_usd:below,observed_price_usd:price
          })
          if(eventError)throw new Error(eventError.message)
          belowTriggered=true;stats.events++
        }else if(!hitBelow&&belowTriggered){
          belowTriggered=false
        }

        await admin.from('token_watchlist').update({
          alert_above_triggered:aboveTriggered,
          alert_below_triggered:belowTriggered,
          alert_last_price_usd:price,
          alert_last_checked_at:new Date().toISOString(),
          updated_at:new Date().toISOString()
        }).eq('id',row.id)
      }catch{
        stats.errors++
      }
    }

    await heartbeat(admin,stats.errors?'degraded':'healthy',startedMs,stats)
    return reply({ok:true,...stats})
  }catch(error){
    const message=error instanceof Error?error.message:'watchlist alert monitor failed'
    if(admin)try{await heartbeat(admin,'failed',startedMs,stats,message)}catch{}
    return reply({error:message,...stats},500)
  }
})
