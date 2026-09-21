import { NextResponse } from 'next/server'

const disabled=()=>NextResponse.json({
  ok:false,
  code:'REAL_MONEY_DISABLED_PAPER_BETA',
  error:'Real-money trading, custody, funded execution, and payouts are disabled in the PAPER-only beta.'
},{status:410,headers:{'Cache-Control':'no-store'}})

export async function POST(){return disabled()}
export async function GET(){return disabled()}
