'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/providers/auth-provider';

/**
 * Login and signup UI.
 *
 * Authentication is mocked: submitting stores a fixture user locally. The
 * shape of this component matches Supabase Auth, so connecting it later means
 * replacing the two calls inside `handleSubmit` with
 * `supabase.auth.signInWithPassword` / `signUp`.
 */
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [pending, setPending] = useState(false);
  const isSignup = mode === 'signup';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    if (isSignup) {
      await signUp(email);
    } else {
      await signIn(email);
    }
    router.push('/dashboard');
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        {isSignup ? 'Create your account' : 'Log in to your account'}
      </h1>
      <p className="mt-2 text-[14px] text-muted">
        {isSignup
          ? 'Save websites, build shortlists and place orders in a few minutes.'
          : 'Welcome back. Pick up where you left off.'}
      </p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        {isSignup ? (
          <>
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                autoComplete="organization"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
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
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5"
          />
          {isSignup ? (
            <p className="mt-1.5 text-[12px] text-muted">At least 8 characters.</p>
          ) : null}
        </div>

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
          {pending ? 'Please wait...' : isSignup ? 'Create account' : 'Log in'}
        </Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-muted">
        {isSignup ? 'Already have an account? ' : 'New to LinkMarket? '}
        <Link
          href={isSignup ? '/login' : '/signup'}
          className="font-medium text-accent-700 hover:underline"
        >
          {isSignup ? 'Log in' : 'Create an account'}
        </Link>
      </p>

      <div className="mt-8 flex gap-2.5 rounded-lg border border-line bg-surface p-3.5 text-[12px] leading-relaxed text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Development build: authentication is mocked. Any credentials sign you in as a demo
          customer. Use an <span className="font-medium text-ink-soft">@linkmarket.io</span> email
          to sign in with admin access.
        </span>
      </div>
    </div>
  );
}
