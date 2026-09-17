import type { SupabaseClient, User } from '@supabase/supabase-js'

async function fingerprintBrowser(){
  if(typeof window==='undefined')return null
  const raw=[
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    String(navigator.hardwareConcurrency||''),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
  ].join('|')
  const bytes=new TextEncoder().encode(raw)
  const digest=await crypto.subtle.digest('SHA-256',bytes)
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')
}

async function registerSessionSignal(supabase:SupabaseClient,user:User){
  if(typeof window==='undefined')return
  const key=`paper-signal:${user.id}`
  if(sessionStorage.getItem(key))return
  try{
    const fingerprintHash=await fingerprintBrowser()
    await supabase.functions.invoke('session-signal',{body:{fingerprintHash}})
    sessionStorage.setItem(key,'1')
  }catch{
    // Risk telemetry must never block normal PAPER trading.
  }
}

async function guaranteeProfile(supabase:SupabaseClient){
  const {error}=await supabase.rpc('ensure_paper_profile')
  if(error)throw new Error(`Could not initialize PAPER balance: ${error.message}`)
}

export async function ensurePaperUser(supabase: SupabaseClient): Promise<User> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if(sessionError)throw sessionError

  if (sessionData.session?.user) {
    await guaranteeProfile(supabase)
    void registerSessionSignal(supabase,sessionData.session.user)
    return sessionData.session.user
  }

  const { data, error } = await supabase.auth.signInAnonymously({
    options: {
      data: { account_type: 'paper' },
    },
  })

  if (error) throw error
  if (!data.user) throw new Error('Could not create PAPER account')
  await guaranteeProfile(supabase)
  void registerSessionSignal(supabase,data.user)
  return data.user
}
