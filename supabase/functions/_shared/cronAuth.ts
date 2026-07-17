// These functions are meant to be invoked only by the daily pg_cron job, never by the
// frontend. The project uses new-format publishable API keys (not JWTs), so `verify_jwt`
// can't be relied on for server-to-server auth here — instead pg_cron sends a shared
// secret header (`x-cron-secret`) that must match the `CRON_SECRET` function secret.
import { jsonResponse } from './cors.ts'

const CRON_SECRET = Deno.env.get('CRON_SECRET')

/** Returns an error Response if the request isn't authorized, or null if it's OK to proceed. */
export function requireCronSecret(req: Request): Response | null {
  if (!CRON_SECRET) {
    console.error('CRON_SECRET is not set in Supabase Secrets')
    return jsonResponse({ error: '이 함수는 인증이 설정되지 않아 호출할 수 없습니다.' }, 500)
  }

  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  return null
}
