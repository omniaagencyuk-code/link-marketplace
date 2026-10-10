import { isSupabaseEnabled } from '@/lib/supabase/config';

/**
 * Whether this deployment offers "Continue with Google".
 *
 * Google sign-in is configured in the Supabase dashboard, not in this
 * repository, so there is nothing here that could detect it. A button that
 * renders because the *code* supports Google and then fails because the
 * *project* does not is worse than no button at all: it is a dead end on the
 * one screen a customer cannot route around.
 *
 * So it is declared rather than guessed. Set `NEXT_PUBLIC_GOOGLE_AUTH=on`
 * only once Google is switched on under Authentication -> Providers with this
 * deployment's callback URL - `<site>/auth/confirm` - in Google's authorised
 * redirect list. Unset, which is every deployment today, and the button does
 * not render and the action refuses: there is no path that sends somebody to
 * a provider nobody has configured.
 *
 * Both halves matter. Google sign-in runs through Supabase, so without
 * Supabase there is no auth server to hand the callback back to.
 */
export function isGoogleAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_AUTH === 'on' && isSupabaseEnabled();
}
