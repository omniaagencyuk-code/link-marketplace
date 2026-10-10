'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  signInAction,
  signInWithGoogleAction,
  signUpAction,
  type AuthActionState,
} from '@/app/(auth)/actions';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { isGoogleAuthEnabled } from '@/lib/auth/google';
import { brand } from '@/lib/config/brand';

/**
 * Login and signup UI.
 *
 * Restyled, not rewired. It still posts to the same two server actions, which
 * still issue the same signed session cookie and still carry `next` through
 * so signing in returns somebody to the page they were trying to reach. The
 * rate limits, the deliberately vague credential errors and the
 * confirm-your-email path are untouched - this component never knew how any
 * of that worked and still does not.
 */
export function AuthForm({ mode, next }: { mode: 'login' | 'signup'; next?: string }) {
  const isSignup = mode === 'signup';
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    isSignup ? signUpAction : signInAction,
    {},
  );

  const withNext = (path: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path);

  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
        {isSignup ? 'Get started' : 'Welcome back'}
      </p>
      <h1 className="mt-3 text-[26px] leading-tight font-semibold tracking-tight text-ink">
        {isSignup ? `Create your ${brand.name} account` : `Log in to ${brand.name}`}
      </h1>
      <p className="mt-2.5 text-[14px] leading-relaxed text-muted">
        {isSignup
          ? `Join ${brand.name} and discover a simpler way to find and order high-quality backlinks.`
          : 'Access your account to find, order and track high-quality backlinks from trusted publishers.'}
      </p>

      {next === '/marketplace' && isSignup ? (
        <p className="mt-4 rounded-lg border border-accent-500/30 bg-accent-50 px-3.5 py-2.5 text-[13px] text-accent-800">
          Your account unlocks the full marketplace straight away.
        </p>
      ) : null}

      <form action={formAction} className="mt-7 space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        {isSignup ? (
          <>
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" autoComplete="name" required className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                name="company"
                autoComplete="organization"
                placeholder="Optional"
                className="mt-1.5"
              />
            </div>
          </>
        ) : null}

        <div>
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@agency.com"
            className="mt-1.5 h-11"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {!isSignup ? (
              <Link href="/forgot-password" className="text-[12px] text-accent-700 hover:underline">
                Forgot password?
              </Link>
            ) : null}
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={8}
            className="mt-1.5 h-11"
          />
          {isSignup ? (
            <p className="mt-1.5 text-[12px] text-muted">At least 8 characters.</p>
          ) : null}
        </div>

        {state.notice ? (
          <p
            role="status"
            className="flex gap-2 rounded-lg border border-accent-500/30 bg-accent-50 px-3.5 py-2.5 text-[13px] text-accent-800"
          >
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {state.notice}
          </p>
        ) : null}

        {state.error ? (
          <p
            role="alert"
            className="flex gap-2 rounded-lg border border-negative/30 bg-negative/5 px-3.5 py-2.5 text-[13px] text-negative"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {state.error}
          </p>
        ) : null}

        <SubmitButton label={isSignup ? 'Create free account' : 'Log in'} />
      </form>

      <GoogleButton next={next} />

      <p className="mt-6 text-center text-[13px] text-muted">
        {isSignup ? 'Already have an account? ' : `New to ${brand.name}? `}
        <Link
          href={withNext(isSignup ? '/login' : '/signup')}
          className="font-medium text-accent-700 hover:underline"
        >
          {isSignup ? 'Log in' : 'Create a free account'}
        </Link>
      </p>

      {!isSupabaseEnabled() ? (
        <div className="mt-8 flex gap-2.5 rounded-lg border border-line bg-surface p-3.5 text-[12px] leading-relaxed text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Development build: credentials are not yet verified, so any email signs you in and
            creates a demo account. The session itself is real and is what protects the
            marketplace.
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * "Continue with Google", and the rule above it.
 *
 * Both are behind the same question, so a deployment without Google
 * configured gets neither a button nor an orphaned "or" dividing a form from
 * nothing. Today that is every deployment: see `src/lib/auth/google.ts` for
 * what has to be true before it appears.
 */
function GoogleButton({ next }: { next?: string }) {
  if (!isGoogleAuthEnabled()) return null;

  return (
    <>
      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[12px] text-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {/* Its own form: a second submit button cannot live inside the credentials one. */}
      <form action={signInWithGoogleAction}>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Button type="submit" variant="outline" size="lg" className="w-full gap-2.5">
          <GoogleMark />
          Continue with Google
        </Button>
      </form>
    </>
  );
}

/** Google's own mark, in its own colours, as their brand terms require. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4.5 w-4.5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84a10.13 10.13 0 0 1-4.4 6.65v5.52h7.12c4.16-3.83 6.56-9.47 6.56-16.18Z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.32l-7.12-5.52c-1.97 1.32-4.49 2.1-7.44 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A22 22 0 0 0 24 46Z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.19a13.2 13.2 0 0 1 0-8.38v-5.7H4.34a22 22 0 0 0 0 19.78l7.35-5.7Z"
      />
      <path
        fill="#EA4335"
        d="M24 9.5c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 2.92 29.93 1 24 1 15.4 1 7.96 5.94 4.34 13.11l7.35 5.7C13.42 13.62 18.27 9.5 24 9.5Z"
      />
    </svg>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="accent" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Please wait...' : label}
      {pending ? null : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
    </Button>
  );
}
