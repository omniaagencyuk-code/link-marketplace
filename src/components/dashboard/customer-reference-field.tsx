'use client';

import { useState, useTransition } from 'react';
import { Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setCustomerReferenceAction } from '@/app/dashboard/orders/actions';

/**
 * The customer's own label on a placed order, editable where it is shown.
 *
 * Editable because somebody will forget to set it at checkout, and an order
 * they cannot find is the problem this exists to solve. It is the only thing
 * on a placed order a customer may change, which is why it is its own narrow
 * control rather than part of an edit form: everything else here is what we
 * are contractually delivering and what they paid.
 *
 * Saving is explicit rather than on blur. The planner's cells autosave
 * because a spreadsheet of twenty-five rows is unusable otherwise; this is
 * one field somebody touches twice a year, and a Save button is clearer
 * about whether the thing happened.
 */
export function CustomerReferenceField({
  orderId,
  reference,
}: {
  orderId: string;
  reference?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(reference ?? '');
  const [saved, setSaved] = useState(reference ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const result = await setCustomerReferenceAction(orderId, value);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSaved(result.reference ?? '');
      setValue(result.reference ?? '');
      setEditing(false);
    });
  };

  if (!editing) {
    return (
      <div>
        <p className="text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
          Your reference
        </p>
        <div className="mt-1 flex items-center gap-2">
          {/*
            An em dash rather than a blank, with the button beside it, so an
            order nobody labelled still offers the way to label it.
          */}
          <span className="min-w-0 truncate text-[14px] text-ink" title={saved || undefined}>
            {saved || <span className="text-muted">—</span>}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 text-muted hover:text-accent-700"
            aria-label={saved ? 'Change your reference' : 'Add your reference'}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={`reference-${orderId}`}
        className="text-[11px] font-semibold tracking-[0.04em] text-muted uppercase"
      >
        Your reference
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={`reference-${orderId}`}
          value={value}
          maxLength={120}
          autoFocus
          placeholder="Sarah - Northbound Q4"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
            if (event.key === 'Escape') {
              setValue(saved);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 rounded-md border border-line-strong bg-white px-2 py-1 text-[14px] text-ink focus:border-navy-900 focus:outline-none"
        />
        <Button variant="accent" size="icon-sm" onClick={save} disabled={pending} aria-label="Save">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}
