import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime='nodejs'
export const dynamic='force-dynamic'

const WINDOW_MINUTES=15
const MAX_MINTS=80
const MAX_ROWS=10000

export async function GET(request:NextRequest){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!secret){
    return NextResponse.json(
      {viewerTotal:0,byMint:{},windowMinutes:WINDOW_MINUTES,available:false,warning:'viewer service unavailable'},
      {headers:{'Cache-Control':'private, max-age=5'}}
    )
  }

  const requested=(request.nextUrl.searchParams.get('mints')||'')
    .split(',')
    .map(value=>value.trim())
    .filter(Boolean)
    .slice(0,MAX_MINTS)
  const mints=[...new Set(requested)]
  const since=new Date(Date.now()-WINDOW_MINUTES*60_000).toISOString()
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})

  try{
    let query=admin.from('token_view_events').select('user_id,mint_address').gte('created_at',since).limit(MAX_ROWS)
    if(mints.length)query=query.in('mint_address',mints)
    const {data,error}=await query
    if(error)throw error

    const globalUsers=new Set<string>()
    const perMint=new Map<string,Set<string>>()
    for(const row of data||[]){
      const user=String(row.user_id||'')
      const mint=String(row.mint_address||'')
      if(!user||!mint)continue
      globalUsers.add(user)
      const set=perMint.get(mint)||new Set<string>()
      set.add(user)
      perMint.set(mint,set)
    }
    const byMint:Record<string,number>={}
    for(const mint of mints)byMint[mint]=perMint.get(mint)?.size||0
    if(!mints.length)for(const [mint,set] of perMint)byMint[mint]=set.size

    return NextResponse.json(
      {viewerTotal:globalUsers.size,byMint,windowMinutes:WINDOW_MINUTES,asOf:Date.now()},
      {headers:{'Cache-Control':'public, s-maxage=5, stale-while-revalidate=10'}}
    )
  }catch(error){
    return NextResponse.json(
      {viewerTotal:0,byMint:{},windowMinutes:WINDOW_MINUTES,error:error instanceof Error?error.message:'viewer lookup failed'},
      {status:503,headers:{'Cache-Control':'no-store'}}
    )
  }
}
