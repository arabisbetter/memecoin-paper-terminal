import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_UI_PREFIXES=[
  '/discover','/spot','/pulse','/profile','/portfolio','/chains','/watchlist',
  '/scanner','/smart-money','/heatmap','/compare','/workspaces','/journal',
  '/replay','/community','/leaderboards','/status','/legal','/wallets',
  '/evaluation','/rewards','/trader','/token'
]
const INTERNAL_PREFIXES=['/admin']

// Deliberately excluded from the public beta: /funded and /coin.
// Evaluation and Rewards are PAPER-only; real-money execution/custody/payout APIs remain hard-disabled.
export function middleware(req:NextRequest){
  const {pathname}=req.nextUrl
  if(pathname==='/'||PUBLIC_UI_PREFIXES.some(p=>pathname===p||pathname.startsWith(p+'/'))||INTERNAL_PREFIXES.some(p=>pathname===p||pathname.startsWith(p+'/'))){
    return NextResponse.next()
  }
  const url=req.nextUrl.clone()
  url.pathname='/spot'
  url.search=''
  return NextResponse.redirect(url,307)
}

export const config={matcher:['/((?!api|_next|.*\\..*).*)']}
