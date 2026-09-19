import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY
  const checkedAt=new Date().toISOString()
  if(!url||!secret)return NextResponse.json({status:'degraded',checkedAt,providers:[],components:[]},{status:503,headers:{'Cache-Control':'no-store'}})
  try{
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const [{data:providers,error:pe},{data:beats,error:be}]=await Promise.all([
      admin.from('paper_market_provider_health').select('provider,status,last_latency_ms,last_success_at,last_failure_at,consecutive_failures,updated_at').order('provider'),
      admin.from('paper_operational_heartbeats').select('component,status,last_success_at,last_failure_at,consecutive_failures,latency_ms,updated_at').order('component')
    ])
    if(pe)throw pe;if(be)throw be
    const cleanProviders=(providers||[]).map((p:any)=>({provider:p.provider,status:p.status,latencyMs:p.last_latency_ms,lastSuccessAt:p.last_success_at,lastFailureAt:p.last_failure_at,consecutiveFailures:p.consecutive_failures,updatedAt:p.updated_at}))
    const cleanComponents=(beats||[]).map((p:any)=>({component:p.component,status:p.status,latencyMs:p.latency_ms,lastSuccessAt:p.last_success_at,lastFailureAt:p.last_failure_at,consecutiveFailures:p.consecutive_failures,updatedAt:p.updated_at}))
    const bad=[...cleanProviders,...cleanComponents].filter((x:any)=>String(x.status).toLowerCase()==='failed'||Number(x.consecutiveFailures||0)>=3)
    return NextResponse.json({status:bad.length?'degraded':'ok',checkedAt,providers:cleanProviders,components:cleanComponents},{headers:{'Cache-Control':'public, s-maxage=10, stale-while-revalidate=30'}})
  }catch(error){
    return NextResponse.json({status:'down',checkedAt,providers:[],components:[],error:'status service unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})
  }
}
