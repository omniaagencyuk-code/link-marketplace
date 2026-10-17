'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import {
  submitPublisherSiteAction,
  type PublisherSubmissionInput,
} from '@/app/(marketing)/list-your-site/actions';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { CURRENCIES, LIMITS, PLACEMENT_TYPES } from '@/lib/publishers/options';
import type { SubmissionErrors } from '@/lib/publishers/rules';

/**
 * The "list your site" form.
 *
 * A client component for the reason the pricing enquiry form is one: four
 * states to show - untouched, submitting, refused with messages against
 * fields, and sent - with a server round trip in the middle of them.
 *
 * The rules deciding what is acceptable are not here. They are in
 * `publishers/rules.ts` and run on the server; what this does is show the
 * answers next to the right inputs. Validating here as well would be two
 * copies of one rule, and the one that drifted would be the one telling a
 * publisher their site was fine before the server disagreed.
 */

const EMPTY: PublisherSubmissionInput = {
  fullName: '',
  email: '',
  domain: '',
  placementType: '',
  price: '',
  // Pre-selected rather than blank: a price typed with no currency chosen is
  // dropped on the server, and a required field nobody notices is a field
  // that costs us the number.
  currency: 'GBP',
  message: '',
  source: 'list-your-site',
  phone: '',
};

export function SiteOfferForm({ reassurance }: { reassurance?: string }) {
  const [values, setValues] = useState<PublisherSubmissionInput>(EMPTY);
  const [errors, setErrors] = useState<SubmissionErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof PublisherSubmissionInput) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  function submit() {
    setErrors({});
    setFailure(null);
    startTransition(async () => {
      const result = await submitPublisherSiteAction(values);
      if (result.ok) {
        setSent(true);
        return;
      }
      if (result.errors) setErrors(result.errors);
      if (result.error) setFailure(result.error);
    });
  }

  /*
    The sent state replaces the form rather than sitting above it. A form
    still on screen under a success message is an invitation to press the
    button again, and the second copy of an offer is one more row for
    somebody to read and reconcile.
  */
  if (sent) {
    return (
      <div
        role="status"
        className="rounded-[var(--radius-card)] border border-accent-200 bg-accent-50 px-6 py-10 text-center"
      >
        <span
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent-700 text-white"
          aria-hidden="true"
        >
          <Check className="h-5 w-5" />
        </span>
        <h3 className="mt-4 text-[18px] font-semibold text-ink">Thanks - that is with us.</h3>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink-soft">
          Someone will look at the site and reply to the address you gave us. If we list it, we
          will confirm the price with you before anything goes live.
        </p>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="offer-name" label="Your name" required error={errors.fullName}>
          <Input
            id="offer-name"
            name="fullName"
            autoComplete="name"
            required
            maxLength={LIMITS.name}
            value={values.fullName}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? 'offer-name-error' : undefined}
            onChange={(event) => set('fullName')(event.target.value)}
          />
        </Field>

        <Field id="offer-email" label="Email" required error={errors.email}>
          <Input
            id="offer-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={LIMITS.email}
            value={values.email}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'offer-email-error' : undefined}
            onChange={(event) => set('email')(event.target.value)}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field id="offer-domain" label="Your website" required error={errors.domain}>
            <Input
              id="offer-domain"
              name="domain"
              autoComplete="url"
              required
              maxLength={LIMITS.domain}
              placeholder="example.com"
              value={values.domain}
              aria-invalid={Boolean(errors.domain)}
              aria-describedby={errors.domain ? 'offer-domain-error' : undefined}
              onChange={(event) => set('domain')(event.target.value)}
            />
          </Field>
        </div>

        <Field id="offer-type" label="What you offer" optional>
          <Select
            id="offer-type"
            name="placementType"
            value={values.placementType}
            onChange={(event) => set('placementType')(event.target.value)}
          >
            <option value="">Select an option</option>
            {PLACEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="offer-price" label="Your price per placement" optional error={errors.price}>
          <div className="flex gap-2">
            <Select
              id="offer-currency"
              name="currency"
              aria-label="Currency"
              className="w-28 shrink-0"
              value={values.currency}
              onChange={(event) => set('currency')(event.target.value)}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
            <Input
              id="offer-price"
              name="price"
              inputMode="decimal"
              maxLength={40}
              placeholder="150"
              value={values.price}
              aria-invalid={Boolean(errors.price)}
              aria-describedby={errors.price ? 'offer-price-error' : undefined}
              onChange={(event) => set('price')(event.target.value)}
            />
          </div>
        </Field>

        <div className="sm:col-span-2">
          <Field id="offer-message" label="Anything else we should know" optional>
            <Textarea
              id="offer-message"
              name="message"
              rows={5}
              maxLength={LIMITS.message}
              placeholder="Turnaround, the topics you will and will not take, whether links are follow, other sites you run."
              value={values.message}
              onChange={(event) => set('message')(event.target.value)}
            />
          </Field>
        </div>
      </div>

      {/*
        The honeypot, and it is not called `website`.

        The pricing form's hidden field has that name, which works there
        because nobody enquiring about rates is asked for one. Here a website
        is the whole submission, so a field of that name would be filled by
        every real publisher and silently discard all of them. `phone` is a
        field this form never asks a person for.

        `aria-hidden` with `tabIndex={-1}` rather than `display: none`, so a
        bot reading styles cannot tell it apart as cheaply.
      */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="offer-phone">Phone</label>
        <input
          id="offer-phone"
          name="phone"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.phone}
          onChange={(event) => set('phone')(event.target.value)}
        />
      </div>

      {failure ? (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-lg border border-negative/30 bg-negative/5 px-3 py-2.5 text-[13px] text-negative"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {failure}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button type="submit" variant="accent" size="lg" disabled={pending}>
          {pending ? 'Sending...' : 'Send us your site'}
        </Button>
        {reassurance ? (
          <p className="max-w-sm text-[12px] leading-relaxed text-muted">{reassurance}</p>
        ) : null}
      </div>
    </form>
  );
}

/** Label, control and its error message, wired together for a screen reader. */
function Field({
  id,
  label,
  required,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="ml-1 font-normal text-muted">(optional)</span> : null}
        {required ? (
          <span className="ml-0.5 text-negative" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[12px] text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}
