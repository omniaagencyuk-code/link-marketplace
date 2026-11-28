import { getServerClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/config/brand';
import { isGoogleAuthEnabled } from '@/lib/auth/google';
import { landingFor } from '@/lib/auth/credentials';
import { refuseCrossSite, sameOrigin, seeOther } from '@/lib/auth/form-response';

/**
 * Start the Google sign-in flow.
 *
 * Supabase builds the consent URL and we send the browser to it; Google
 * returns to `/auth/confirm`, which already exchanges a `?code=` for a
 * session and honours `next`. So this adds no new callback, no new session
 * handling and no second source of truth about who is signed in - it is the
 * existing door with a second key.
 *
 * It refuses unless `NEXT_PUBLIC_GOOGLE_AUTH` says the provider is actually
 * configured. The button is gated on the same answer, so this is the second
 * of two locks rather than the only one: a hand-posted form cannot send
 * somebody to a provider that is not set up.
 *
 * Not rate limited, deliberately. Nothing here checks a credential, so there
 * is nothing to brute force, and counting it against the sign-in budget would
 * let a redirect lock somebody out of their own password form.
 *
 * Never enhanced with `fetch`: the whole point is to navigate away, so the
 * form that posts here is an ordinary one and this only ever redirects.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return refuseCrossSite();

  const form = await request.formData();
  const next = landingFor(String(form.get('next') ?? '') || null);
  const failed = `/login?error=google-unavailable&next=${encodeURIComponent(next)}`;

  if (!isGoogleAuthEnabled()) return seeOther(failed);

  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent(next)}` },
  });

  if (error || !data?.url) return seeOther(failed);
  return seeOther(data.url);
}
