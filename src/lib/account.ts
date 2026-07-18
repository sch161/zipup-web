import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Calls the `delete-account` Edge Function, which deletes the current user via the
 * Supabase Auth admin API (service_role only). Rows in `analyses`/`gaslighting_checks`
 * cascade-delete automatically via their `user_id` foreign key.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account')

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const parsed = await error.context.json().catch(() => null)
      throw new Error(parsed?.error ?? error.message)
    }
    throw new Error(error.message)
  }
}
