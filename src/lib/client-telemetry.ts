'use client'

import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'

export async function logClientError(area:string,error:unknown,detail:Record<string,unknown>={}){
  const message=error instanceof Error?error.message:String(error||'Unknown client error')
  console.error('[PAPER '+area+']',error,detail)
  if(typeof window==='undefined')return
  try{
    const supabase=createClient(),user=await ensurePaperUser(supabase)
    await (supabase as any).from('paper_client_errors').insert({
      user_id:user.id,area,message:message.slice(0,1000),detail,page:window.location.pathname+window.location.search
    })
  }catch(loggingError){console.error('[PAPER telemetry]',loggingError)}
}
