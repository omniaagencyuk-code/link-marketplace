'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordResetAction, type AuthActionState } from '@/app/(auth)/actions';

/**
 * Request a password reset link.
 *
 * The response is the same whether or not the address has an account -
 * confirming which emails are registered is a free gift to anyone probing, and
 * the action enforces that server-side too.
 */
export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    requestPasswordResetAction,
    {},
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Reset your password</h1>
      <p className="mt-2 text-[14px] text-muted">
        Enter your email address and we will send you a link to set a new password.
      </p>

      <form action={formAction} className="mt-7 space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
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

        <SubmitButton />
      </form>

      <p className="mt-5 text-center text-[13px] text-muted">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-accent-700 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="accent" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Sending...' : 'Send reset link'}
    </Button>
  );
}
