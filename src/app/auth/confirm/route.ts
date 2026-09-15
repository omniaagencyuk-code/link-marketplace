import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Where Supabase sends people from a confirmation or password-reset email.
 *
 * Exchanges the one-time token in the link for a real session, then forwards
 * to wherever they were originally headed. The token is single-use, so an
 * expired or already-used link lands on the login page with an explanation
 * rather than a blank error.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');

  // Only same-origin paths, so a crafted link cannot bounce someone offsite
  // carrying a fresh session.
  const requested = searchParams.get('next') ?? '/dashboard';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard';

  if (!isSupabaseEnabled()) return NextResponse.redirect(new URL('/login', origin));

  const supabase = await getServerClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  const failed = new URL('/login', origin);
  failed.searchParams.set('error', 'link-expired');
  failed.searchParams.set('next', next);
  return NextResponse.redirect(failed);
}
