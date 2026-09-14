'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signInAction, signUpAction, type AuthActionState } from '@/app/(auth)/actions';
import { brand } from '@/lib/config/brand';

/**
 * Login and signup UI.
 *
 * Submits to a server action, which issues the signed session cookie. The
 * credential check itself is still mocked, but the session is real - it is
 * what every protected route verifies. `next` carries the page the visitor
 * was trying to reach, so signing in returns them to it.
 */
export function AuthForm({ mode, next }: { mode: 'login' | 'signup'; next?: string }) {
  const isSignup = mode === 'signup';
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    isSignup ? signUpAction : signInAction,
    {},
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        {isSignup ? 'Create your free account' : 'Log in to your account'}
      </h1>
      <p className="mt-2 text-[14px] text-muted">
        {isSignup
          ? 'Unlock the marketplace, save shortlists and order links and content.'
          : 'Welcome back. Pick up where you left off.'}
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
            className="mt-1.5"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {!isSignup ? (
              <Link href="/login" className="text-[12px] text-accent-700 hover:underline">
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
            className="mt-1.5"
          />
          {isSignup ? (
            <p className="mt-1.5 text-[12px] text-muted">At least 8 characters.</p>
          ) : null}
        </div>

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

      <p className="mt-5 text-center text-[13px] text-muted">
        {isSignup ? 'Already have an account? ' : `New to ${brand.name}? `}
        <Link
          href={
            isSignup
              ? `/login${next ? `?next=${encodeURIComponent(next)}` : ''}`
              : `/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`
          }
          className="font-medium text-accent-700 hover:underline"
        >
          {isSignup ? 'Log in' : 'Create a free account'}
        </Link>
      </p>

      <div className="mt-8 flex gap-2.5 rounded-lg border border-line bg-surface p-3.5 text-[12px] leading-relaxed text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Development build: credentials are not yet verified, so any email signs you in and
          creates a demo account. The session itself is real and is what protects the marketplace.
        </span>
      </div>
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="accent" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Please wait...' : label}
    </Button>
  );
}
