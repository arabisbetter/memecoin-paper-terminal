import { NextResponse } from 'next/server'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const checkedAt=new Date().toISOString()
  if(!url)return NextResponse.json({status:'degraded',checkedAt,providers:[],components:[]},{status:503,headers:{'Cache-Control':'no-store'}})
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000)
  try{
    const response=await fetch(new URL('/functions/v1/system-status-public',url),{
      cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}
    })
    const body=await response.json()
    if(!response.ok)throw new Error('status upstream '+response.status)
    return NextResponse.json(body,{headers:{'Cache-Control':'public, s-maxage=10, stale-while-revalidate=30'}})
  }catch{
    return NextResponse.json({status:'down',checkedAt,providers:[],components:[],error:'status service unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})
  }finally{clearTimeout(timer)}
}
