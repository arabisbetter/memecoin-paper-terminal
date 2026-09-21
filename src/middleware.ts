import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_UI_PREFIXES=['/spot','/pulse','/profile','/legal']
const INTERNAL_PREFIXES=['/admin']

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
