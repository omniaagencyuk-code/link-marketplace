'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { KeyRound, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  signInAdminAction,
  signInAdminWithAccountAction,
  type AdminLoginState,
} from './actions';

/**
 * Two ways in, while the first replaces the second.
 *
 * Signing in with a team account is the real route: each administrator has
 * their own identity, so the database can see who is acting. The shared
 * password is kept behind a disclosure as a fallback, so that enabling
 * accounts cannot lock the team out before anyone has been granted the role.
 *
 * It is a disclosure rather than a tab because it should feel like the way
 * out of a corner, not an equal choice. When the shared password goes, this
 * component loses a block and nothing else changes.
 */
export function AdminLoginForm({
  next,
  sharedPasswordAvailable,
}: {
  next?: string;
  /** False once ADMIN_PASSWORD is removed, which hides the fallback entirely. */
  sharedPasswordAvailable: boolean;
}) {
  const [showFallback, setShowFallback] = useState(false);

  const [accountState, accountAction, accountPending] = useActionState<AdminLoginState, FormData>(
    signInAdminWithAccountAction,
    {},
  );

  return (
    <div className="space-y-5">
      <form action={accountAction} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <div>
          <Label htmlFor="admin-email">Work email</Label>
          <Input
            id="admin-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="admin-password">Password</Label>
          <Input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1.5"
          />
        </div>

        {accountState.error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {accountState.error}
          </p>
        ) : null}

        {accountState.notice ? (
          <div
            role="status"
            className="rounded-md border border-line bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink-soft"
          >
            {accountState.notice}{' '}
            <Link href="/dashboard" className="font-medium text-accent-700 hover:underline">
              Go to your dashboard
            </Link>
            .
          </div>
        ) : null}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={accountPending}>
          <Lock className="h-4 w-4" />
          {accountPending ? 'Checking...' : 'Sign in'}
        </Button>
      </form>

      {sharedPasswordAvailable ? (
        <div className="border-t border-line pt-4">
          {showFallback ? (
            <SharedPasswordForm next={next} />
          ) : (
            <button
              type="button"
              onClick={() => setShowFallback(true)}
              className="flex w-full items-center justify-center gap-1.5 text-[13px] text-muted hover:text-ink"
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              Use the shared team password
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SharedPasswordForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<AdminLoginState, FormData>(
    signInAdminAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <p className="text-[12px] leading-relaxed text-muted">
        The shared password is being retired. Sign in with your own account where you can, so that
        changes are recorded against a person.
      </p>

      <div>
        <Label htmlFor="shared-email">Your work email</Label>
        <Input
          id="shared-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="shared-password">Shared password</Label>
        <Input
          id="shared-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5"
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="outline" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Checking...' : 'Sign in with shared password'}
      </Button>
    </form>
  );
}
