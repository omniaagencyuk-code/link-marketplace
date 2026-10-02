'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { runNowAction } from '@/app/admin/(protected)/refresh/actions';

/**
 * Refresh one tier, from the row that says how many of it are overdue.
 *
 * "Run now" takes whatever is due in tier order, which is right for a schedule
 * and wrong for somebody deciding how to spend the month: five hundred overdue
 * tier 3 domains is tens of thousands of units, and it was all or nothing.
 *
 * The button sits on the tier's own row because that is where the number it
 * will act on already is - a tier picker somewhere else would mean reading a
 * count here and choosing there.
 */
export function RunTier({ tier, overdue }: { tier: 1 | 2 | 3; overdue: number }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (overdue === 0) {
    return <span className="text-[12px] text-muted">nothing due</span>;
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {result ? <span className="text-[12px] text-muted">{result}</span> : null}
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() =>
          startTransition(async () => {
            // Said out loud with the count, because this is the click that
            // spends credits and the number is the whole decision.
            if (
              !window.confirm(
                `Refresh the ${overdue} overdue ${overdue === 1 ? 'domain' : 'domains'} in tier ${tier}? This spends Ahrefs units.`,
              )
            ) {
              return;
            }
            const outcome = await runNowAction(tier);
            setResult(outcome.error ?? outcome.message ?? null);
            router.refresh();
          })
        }
      >
        <Play className="h-3 w-3" aria-hidden="true" />
        {busy ? 'Running…' : `Refresh tier ${tier}`}
      </Button>
    </div>
  );
}
