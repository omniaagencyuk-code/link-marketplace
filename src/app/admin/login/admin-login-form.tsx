'use client';

import { useActionState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signInAdminAction, type AdminLoginState } from './actions';

export function AdminLoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<AdminLoginState, FormData>(
    signInAdminAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
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

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        <Lock className="h-4 w-4" />
        {pending ? 'Checking...' : 'Sign in'}
      </Button>
    </form>
  );
}
