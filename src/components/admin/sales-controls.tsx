'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SalesActionResult } from '@/app/admin/(protected)/sales/actions';

/**
 * One button that calls a server action and says what happened.
 *
 * Every destructive or spending action in the Sales Centre goes through this,
 * so the feedback is in one place rather than written slightly differently on
 * each page - and so a `confirm` prompt is available wherever one is needed.
 *
 * The result message is shown verbatim. Every action that refuses explains
 * which switch to change, and swallowing that in favour of "something went
 * wrong" would turn a solvable problem into a support question.
 *
 * ## Why `args` instead of a closure
 *
 * The obvious call is `action={() => doThing(id)}`, and it compiles, builds
 * and then throws at runtime: a server component may pass a *server action*
 * across the boundary, but not an ordinary function that closes over one. The
 * error is "Functions cannot be passed directly to Client Components", and a
 * production build does not catch it - only opening the page does.
 *
 * So the action arrives as the reference it is and its arguments arrive
 * beside it, applied here on the client. `.bind(null, ...)` is the documented
 * equivalent and is also fine, but only once it is on this side of the
 * boundary - which is the part that is easy to get wrong.
 */
export function SalesAction<A extends unknown[] = []>({
  action,
  args,
  label,
  busyLabel,
  confirm,
  variant = 'outline',
  size = 'sm',
  icon,
  disabled,
  disabledReason,
}: {
  action: (...args: A) => Promise<SalesActionResult>;
  args?: A;
  label: string;
  busyLabel?: string;
  confirm?: string;
  variant?: 'primary' | 'outline' | 'accent' | 'ghost';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SalesActionResult | null>(null);

  function run() {
    if (confirm && !window.confirm(confirm)) return;

    setResult(null);
    startTransition(async () => {
      try {
        setResult(await action(...((args ?? []) as A)));
      } catch (error) {
        setResult({ ok: false, error: error instanceof Error ? error.message : 'Failed.' });
      }
      router.refresh();
    });
  }

  return (
    <div>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={pending || disabled}
        onClick={run}
        title={disabled ? disabledReason : undefined}
      >
        {icon}
        {pending ? (busyLabel ?? 'Working...') : label}
      </Button>
      {result ? <Feedback result={result} /> : null}
      {disabled && disabledReason ? (
        <p className="mt-1.5 text-[12px] text-muted">{disabledReason}</p>
      ) : null}
    </div>
  );
}

export function Feedback({ result }: { result: SalesActionResult }) {
  return (
    <div
      role="status"
      className={
        result.ok
          ? 'mt-2 flex gap-2 rounded-lg border border-accent-300 bg-accent-50/50 p-2.5 text-[13px] leading-relaxed text-ink'
          : 'mt-2 flex gap-2 rounded-lg border border-coral-300 bg-coral-50 p-2.5 text-[13px] leading-relaxed text-coral-900'
      }
    >
      {result.ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-700" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>{result.error ?? result.message}</span>
    </div>
  );
}

/**
 * A form that posts to a server action and shows the result in place.
 *
 * Used for the settings form, the paste-a-list box and the suppression box.
 * The children are ordinary inputs, so each page keeps its own fields and only
 * the plumbing is shared.
 */
export function SalesForm({
  action,
  submitLabel,
  children,
  confirm,
}: {
  action: (formData: FormData) => Promise<SalesActionResult>;
  submitLabel: string;
  children: React.ReactNode;
  confirm?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SalesActionResult | null>(null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (confirm && !window.confirm(confirm)) return;

        const formData = new FormData(event.currentTarget);
        setResult(null);
        startTransition(async () => {
          try {
            setResult(await action(formData));
          } catch (error) {
            setResult({ ok: false, error: error instanceof Error ? error.message : 'Failed.' });
          }
          router.refresh();
        });
      }}
    >
      {children}
      <div className="mt-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Saving...' : submitLabel}
        </Button>
      </div>
      {result ? <Feedback result={result} /> : null}
    </form>
  );
}
