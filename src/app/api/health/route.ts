import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime='nodejs'
export const dynamic='force-dynamic'

const ageMs=(value:unknown)=>{
  const t=new Date(String(value||'')).getTime()
  return Number.isFinite(t)?Date.now()-t:Number.POSITIVE_INFINITY
}

export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY
  const commit=process.env.VERCEL_GIT_COMMIT_SHA||process.env.PAPER_RELEASE_SHA||'unknown'
  const checkedAt=new Date().toISOString()

  if(!url||!secret){
    return NextResponse.json(
      {status:'degraded',checkedAt,commit,checks:{database:'unconfigured'}},
      {status:503,headers:{'Cache-Control':'no-store'}}
    )
  }

  try{
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
    const {data,error}=await admin.rpc('paper_ops_health_snapshot_v1')
    if(error)throw new Error(error.message)

    const heartbeats=Array.isArray(data?.heartbeats)?data.heartbeats:[]
    const cron=Array.isArray(data?.cron)?data.cron:[]
    const evalBeat=heartbeats.find((h:any)=>h.component==='evaluation_monitor')
    const fundedBeat=heartbeats.find((h:any)=>h.component==='funded_monitor')
    const requiredCron=['paper-evaluation-monitor-v1','paper-funded-monitor-v1','paper-funded-settlement-v1','paper-operational-prune-v1']
    const cronHealthy=requiredCron.every(name=>cron.some((j:any)=>j.jobname===name&&j.active===true))
    const evalFresh=evalBeat?ageMs(evalBeat.last_success_at)<120_000:ageMs(data?.evaluation_monitor?.completed_at)<120_000
    const fundedFresh=fundedBeat?ageMs(fundedBeat.last_success_at)<120_000:true
    const evalFailed=evalBeat?.status==='failed'
    const fundedFailed=fundedBeat?.status==='failed'
    const status=cronHealthy&&evalFresh&&fundedFresh&&!evalFailed&&!fundedFailed?'ok':'degraded'

    return NextResponse.json({
      status,checkedAt,commit,
      checks:{
        database:'ok',
        cron:cronHealthy?'ok':'degraded',
        evaluationMonitor:evalFresh&&!evalFailed?'ok':'degraded',
        fundedMonitor:fundedFresh&&!fundedFailed?'ok':'degraded'
      }
    },{
      status:status==='ok'?200:503,
      headers:{'Cache-Control':'no-store','X-PAPER-Health':status}
    })
  }catch(error){
    return NextResponse.json({
      status:'down',checkedAt,commit,
      checks:{database:'down'},
      error:error instanceof Error?error.message:'health check failed'
    },{status:503,headers:{'Cache-Control':'no-store'}})
  }
}
