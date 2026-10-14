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
 * So it is declared rather than guessed. Unset, and the button does not
 * render and the action refuses: there is no path that sends somebody to a
 * provider nobody has configured.
 *
 * Set `NEXT_PUBLIC_GOOGLE_AUTH=on` once the provider is actually configured.
 * `.env.example` lists the steps; the one worth repeating is that there are
 * two callback URLs and they are not interchangeable. Google's OAuth client
 * wants the callback Supabase displays on its own provider page, because
 * Google hands the user to Supabase. `<site>/auth/confirm` - what
 * `signInWithGoogleAction` passes as `redirectTo` - belongs in Supabase's
 * Redirect URLs allow-list instead. Putting ours in Google's box is the way
 * this usually goes wrong.
 *
 * Both halves matter. Google sign-in runs through Supabase, so without
 * Supabase there is no auth server to hand the callback back to.
 */
export function isGoogleAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_AUTH === 'on' && isSupabaseEnabled();
}
