import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const REQUIRED=[['tos','v2'],['privacy','v1'],['risk_disclosure','v2']] as const
const out=(body:unknown,status=200)=>NextResponse.json(body,{status})

function serverIp(req:NextRequest){
  const forwarded=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const direct=req.headers.get('x-real-ip')?.trim()
  const value=forwarded||direct||''
  return value&&value.length<=64?value:null
}

export async function POST(req:NextRequest){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!pub)return out({error:'LEGAL_ACCEPTANCE_UNAVAILABLE'},503)
  const auth=req.headers.get('authorization')
  if(!auth?.startsWith('Bearer '))return out({error:'AUTH_REQUIRED'},401)

  const userClient=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:userError}=await userClient.auth.getUser()
  if(userError||!user)return out({error:'AUTH_REQUIRED'},401)

  const ip=serverIp(req)
  const rows=REQUIRED.map(([document_type,document_version])=>({
    user_id:user.id,document_type,document_version,ip_at_acceptance:ip,
  }))
  const writer=secret?createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}):userClient
  const {error}=await writer.from('legal_acceptances').upsert(rows,{
    onConflict:'user_id,document_type,document_version',ignoreDuplicates:true,
  })
  if(error)return out({error:'LEGAL_ACCEPTANCE_WRITE_FAILED'},500)
  return out({ok:true,documents:REQUIRED.map(([type,version])=>({type,version}))})
}
