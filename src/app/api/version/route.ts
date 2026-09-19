import { NextResponse } from 'next/server'

export const dynamic='force-dynamic'

export async function GET(){
  return NextResponse.json({
    commit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||'local',
    environment:process.env.VERCEL_ENV||process.env.NODE_ENV||'unknown',
  },{headers:{'Cache-Control':'no-store'}})
}
