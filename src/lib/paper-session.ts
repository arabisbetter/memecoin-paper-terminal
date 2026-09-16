import type { SupabaseClient, User } from '@supabase/supabase-js'

export async function ensurePaperUser(supabase: SupabaseClient): Promise<User> {
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session?.user) return sessionData.session.user

  const { data, error } = await supabase.auth.signInAnonymously({
    options: {
      data: { account_type: 'paper' },
    },
  })

  if (error) throw error
  if (!data.user) throw new Error('Could not create PAPER account')
  return data.user
}
