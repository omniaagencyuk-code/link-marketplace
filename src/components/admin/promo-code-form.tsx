'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  createPromoCodeAction,
  deletePromoCodeAction,
  setPromoActiveAction,
  type PromoFormValues,
} from '@/app/admin/(protected)/promo-codes/actions';

/**
 * Creating a code.
 *
 * Every limit is optional and an empty box means no limit, which is the one
 * thing this form has to make unmistakable - a blank "max uses" that quietly
 * became 0 would be a code nobody could use, created by somebody who thought
 * they were leaving it unlimited. Hence the placeholders: they say "no limit"
 * rather than showing a number.
 */

const empty: PromoFormValues = {
  code: '',
  description: '',
  kind: 'percent',
  percentOff: '',
  amountOff: '',
  currency: 'GBP',
  startsAt: '',
  expiresAt: '',
  maxRedemptions: '',
  maxPerCustomer: '1',
  minOrder: '',
  firstOrderOnly: false,
};

export function PromoCodeForm() {
  const router = useRouter();
  const [values, setValues] = useState<PromoFormValues>(empty);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function set<K extends keyof PromoFormValues>(key: K, value: PromoFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    setError(null);
    setNotice(null);
    setWarning(null);
    startTransition(async () => {
      const result = await createPromoCodeAction(values);
      if (!result.ok) {
        setError(result.error ?? 'Could not create that code.');
        return;
      }
      setNotice(result.message ?? 'Created.');
      setWarning(result.warning ?? null);
      setValues(empty);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Code" hint="Letters, numbers and dashes. People have to type it.">
            <Input
              value={values.code}
              onChange={(event) => set('code', event.target.value.toUpperCase())}
              placeholder="SPRING25"
              className="font-mono tracking-wide uppercase"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>

          <Field label="Discount">
            <div className="flex gap-2">
              <Select
                value={values.kind}
                onChange={(event) => set('kind', event.target.value)}
                className="w-28"
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed</option>
              </Select>
              {values.kind === 'percent' ? (
                <Input
                  value={values.percentOff}
                  onChange={(event) => set('percentOff', event.target.value)}
                  placeholder="25"
                  inputMode="numeric"
                  aria-label="Percent off"
                />
              ) : (
                <Input
                  value={values.amountOff}
                  onChange={(event) => set('amountOff', event.target.value)}
                  placeholder="50"
                  inputMode="decimal"
                  aria-label="Amount off"
                />
              )}
            </div>
          </Field>

          {/* Only for a fixed amount: £50 off is a different offer in another
              currency, and Stripe refuses such a coupon against a session it
              was not created for. A percentage is currency-agnostic. */}
          {values.kind === 'fixed' ? (
            <Field label="Currency" hint="A fixed code only works on orders in this currency.">
              <Select value={values.currency} onChange={(event) => set('currency', event.target.value)}>
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </Select>
            </Field>
          ) : null}

          <Field label="Minimum order" hint="Blank for no minimum.">
            <Input
              value={values.minOrder}
              onChange={(event) => set('minOrder', event.target.value)}
              placeholder="no minimum"
              inputMode="decimal"
            />
          </Field>

          <Field label="Starts" hint="Blank to start now.">
            <Input
              type="date"
              value={values.startsAt}
              onChange={(event) => set('startsAt', event.target.value)}
            />
          </Field>

          <Field label="Expires" hint="Works all day on this date. Blank never expires.">
            <Input
              type="date"
              value={values.expiresAt}
              onChange={(event) => set('expiresAt', event.target.value)}
            />
          </Field>

          <Field label="Total uses" hint="Across everybody. Blank for unlimited.">
            <Input
              value={values.maxRedemptions}
              onChange={(event) => set('maxRedemptions', event.target.value)}
              placeholder="unlimited"
              inputMode="numeric"
            />
          </Field>

          <Field label="Uses per customer" hint="Blank for unlimited.">
            <Input
              value={values.maxPerCustomer}
              onChange={(event) => set('maxPerCustomer', event.target.value)}
              placeholder="unlimited"
              inputMode="numeric"
            />
          </Field>

          <div className="sm:col-span-2 lg:col-span-4">
            <Field label="What it is for" hint="Internal. Never shown to a customer.">
              <Textarea
                value={values.description}
                onChange={(event) => set('description', event.target.value)}
                placeholder="Spring newsletter, sent 14 March"
                rows={2}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-ink-soft sm:col-span-2">
            <input
              type="checkbox"
              checked={values.firstOrderOnly}
              onChange={(event) => set('firstOrderOnly', event.target.checked)}
              className="h-4 w-4 rounded border-line-strong"
            />
            First orders only - refused for anybody who has paid before
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button variant="accent" size="sm" onClick={submit} disabled={busy}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Creating...' : 'Create code'}
          </Button>

          {notice ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-accent-700">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {notice}
            </span>
          ) : null}

          {error ? (
            <span role="alert" className="inline-flex items-start gap-1.5 text-[13px] text-negative">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {error}
            </span>
          ) : null}
        </div>

        {warning ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            {warning}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[12px] font-medium text-ink-soft">{label}</p>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

/** Switch a code off, or delete one nobody has used. */
export function PromoRowActions({
  id,
  code,
  active,
  used,
}: {
  id: string;
  code: string;
  active: boolean;
  used: number;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      {error ? <span className="text-[11px] text-negative">{error}</span> : null}
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() =>
          startTransition(async () => {
            await setPromoActiveAction(id, !active);
            router.refresh();
          })
        }
      >
        {active ? 'Switch off' : 'Switch on'}
      </Button>
      {/* Only ever offered for an unused code. A used one carries the record of
          the discounts it gave, and deleting it would take them with it. */}
      {used === 0 ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              if (!window.confirm(`Delete ${code}? Nobody has used it, so nothing is lost.`)) return;
              const result = await deletePromoCodeAction(id);
              if (!result.ok) setError(result.error ?? 'Could not delete it.');
              router.refresh();
            })
          }
        >
          Delete
        </Button>
      ) : null}
    </div>
  );
}
