'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { AlertCircle, Check, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPrice } from '@/lib/utils/format';
import { checkPromoCodeAction, type PromoPreview } from '@/app/dashboard/orders/actions';
import type { DraftOrderItem } from '@/lib/types';

/**
 * The promo code box.
 *
 * Checked before checkout rather than at it, because a code that turns out to
 * be expired should say so here - finding out on Stripe's page, or worse by
 * being charged the full amount, is the version of this that generates
 * support email.
 *
 * What it shows is never the authority on the discount. Checkout re-validates
 * and re-prices on the server, so an accepted code here is a preview and a
 * basket edited afterwards gets a fresh answer.
 */
export function PromoField({
  items,
  signature,
  onApplied,
}: {
  items: DraftOrderItem[];
  /**
   * Changes whenever the basket does.
   *
   * An applied code is dropped when it moves. The discount was computed
   * against a particular subtotal, so a basket that has since lost a line is
   * showing a figure that is no longer true - and a minimum-spend code could
   * have stopped qualifying entirely. Making them type it again is better than
   * showing them a saving they are not getting.
   */
  signature: string;
  /** Lifted up so the total line can show the discount. */
  onApplied: (applied: PromoPreview | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [applied, setApplied] = useState<PromoPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const lastSignature = useRef(signature);
  useEffect(() => {
    // Not on the first render: the signature arrives already set, and
    // clearing then would fight the user on mount.
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    setApplied(null);
    setError(null);
    onApplied(null);
  }, [signature, onApplied]);

  function apply() {
    setError(null);
    startTransition(async () => {
      const result = await checkPromoCodeAction(items, value);
      if (!result.ok) {
        setError(result.error ?? 'That code is not valid.');
        setApplied(null);
        onApplied(null);
        return;
      }
      setApplied(result);
      onApplied(result);
    });
  }

  function remove() {
    setApplied(null);
    setValue('');
    setError(null);
    onApplied(null);
  }

  if (applied) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-2.5 py-1 text-[12px] font-medium text-accent-700">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          {applied.code} applied - {applied.summary}
        </span>
        <span className="tabular text-[13px] text-ink-soft">
          &minus;{formatPrice(applied.discountMinor ?? 0)}
          {applied.payableMinor === 0 ? ' (nothing left to pay)' : ''}
        </span>
        <button
          type="button"
          onClick={remove}
          className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Remove
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-[13px] text-accent-700 hover:underline"
        >
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
          Have a promo code?
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="promo" className="sr-only">
          Promo code
        </label>
        <Input
          id="promo"
          value={value}
          // Shown back in the spelling it will be compared in, so nobody
          // wonders why they typed lower case and it went upper.
          onChange={(event) => setValue(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              apply();
            }
          }}
          placeholder="PROMO CODE"
          autoComplete="off"
          spellCheck={false}
          className="w-44 font-mono tracking-wide uppercase"
        />
        <Button variant="outline" size="sm" onClick={apply} disabled={busy || !value.trim()}>
          {busy ? 'Checking...' : 'Apply'}
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 text-[13px] text-negative"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
