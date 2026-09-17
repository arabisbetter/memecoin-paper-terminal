import { createBrowserClient } from '@supabase/ssr'

let browserClient: ReturnType<typeof createBrowserClient> | undefined

// These are browser-safe Supabase values. The publishable key is intentionally
// public and still relies on RLS for authorization. Environment variables win
// when present, but the fallback prevents a missing Vercel env from blanking
// the entire PAPER account experience.
const FALLBACK_URL = 'https://bpnhybmptjenrjntvmsz.supabase.co'
const FALLBACK_PUBLISHABLE_KEY = 'sb_publishable_5FQkar9y4CLyciMdXD_2VQ_kjfGJBY0'

export function createClient() {
  if (browserClient) return browserClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || FALLBACK_PUBLISHABLE_KEY

  browserClient = createBrowserClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return browserClient
}
