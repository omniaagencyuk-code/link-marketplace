'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ShieldMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { grantAdminAction, revokeAdminAction } from '@/app/admin/(protected)/users/actions';

/**
 * Grant or remove admin access for one account.
 *
 * Both directions confirm first. Granting admin hands someone the keys to the
 * whole platform and removing it can lock a colleague out mid-task, so neither
 * should be one stray click away.
 */
export function UserRoleButton({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = isAdmin ? await revokeAdminAction(email) : await grantAdminAction(email);
      if (result.ok) {
        setConfirming(false);
        router.refresh();
        return;
      }
      setError(result.error ?? 'That did not work.');
      setConfirming(false);
    });
  }

  if (error) {
    return (
      <div className="text-right">
        <p className="text-[12px] leading-snug text-coral-700">{error}</p>
        <button
          type="button"
          onClick={() => setError(null)}
          className="mt-1 text-[12px] text-muted hover:text-ink"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant={isAdmin ? 'danger' : 'primary'}
          onClick={run}
          disabled={pending}
        >
          {pending ? 'Working...' : isAdmin ? 'Remove admin' : 'Confirm'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
      {isAdmin ? (
        <>
          <ShieldMinus className="h-3.5 w-3.5" aria-hidden="true" />
          Remove admin
        </>
      ) : (
        <>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Make admin
        </>
      )}
    </Button>
  );
}
