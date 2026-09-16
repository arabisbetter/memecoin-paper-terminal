import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'PAPER trade execution moved to the authenticated Supabase paper-trade function.' },
    { status: 410 }
  )
}
