'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  closeClaimAction,
  runChecksNowAction,
} from '@/app/admin/(protected)/link-monitor/actions';

/** Run a small batch now, rather than waiting for the night. */
export function RunChecksNow() {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() =>
          startTransition(async () => {
            const outcome = await runChecksNowAction();
            setResult(outcome.message ?? outcome.error ?? null);
            router.refresh();
          })
        }
      >
        <Play className="h-4 w-4" aria-hidden="true" />
        {busy ? 'Checking...' : 'Check 25 now'}
      </Button>
      {result ? <span className="text-[12px] text-muted">{result}</span> : null}
    </div>
  );
}

/**
 * Record that a refund has been paid.
 *
 * Confirmed out loud, because this is the row that says somebody is owed
 * money and closing it is how the queue forgets about them.
 */
export function CloseClaim({ claimId, amount }: { claimId: string; amount: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() =>
        startTransition(async () => {
          if (!window.confirm(`Close this claim? Only do this once the ${amount} refund is paid.`)) {
            return;
          }
          await closeClaimAction(claimId);
          router.refresh();
        })
      }
    >
      {busy ? 'Closing...' : 'Mark settled'}
    </Button>
  );
}
