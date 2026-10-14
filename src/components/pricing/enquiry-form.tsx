'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import {
  submitPricingEnquiryAction,
  type EnquirySubmission,
} from '@/app/(marketing)/pricing/actions';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { BUDGET_BANDS, INTERESTS, LIMITS } from '@/lib/enquiries/options';
import type { EnquiryErrors } from '@/lib/enquiries/rules';

/**
 * The pricing enquiry form.
 *
 * A client component because it has four states to show - untouched,
 * submitting, refused with messages against fields, and sent - and a server
 * round trip in the middle of them. Everything else on this page is a server
 * component.
 *
 * The rules deciding what is acceptable are not here. They are in
 * `enquiries/rules.ts` and run on the server; what this does is show the
 * answers next to the right inputs. Validating here as well would be two
 * copies of the same rule, and the one that drifted would be the one telling
 * somebody their address was fine before the server disagreed.
 *
 * `required` and `maxLength` are on the inputs regardless. They are not the
 * check - they are the browser being helpful before a round trip, and they
 * cost nothing.
 */

const EMPTY: EnquirySubmission = {
  fullName: '',
  email: '',
  company: '',
  budgetBand: '',
  interest: '',
  message: '',
  source: 'pricing-page',
  website: '',
};

export function EnquiryForm({ reassurance }: { reassurance?: string }) {
  const [values, setValues] = useState<EnquirySubmission>(EMPTY);
  const [errors, setErrors] = useState<EnquiryErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof EnquirySubmission) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  function submit() {
    setErrors({});
    setFailure(null);
    startTransition(async () => {
      const result = await submitPricingEnquiryAction(values);
      if (result.ok) {
        setSent(true);
        return;
      }
      if (result.errors) setErrors(result.errors);
      if (result.error) setFailure(result.error);
    });
  }

  /*
    The sent state replaces the form rather than sitting above it.

    A form still on screen under a success message is an invitation to press
    the button again, and the second copy of an enquiry is somebody's
    reply-to address duplicated in a list a person has to read.
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
          Someone will read it and reply to the address you gave us. In the meantime you can keep
          browsing the marketplace and buy placements at their listed prices.
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
        <Field
          id="enquiry-name"
          label="Full name"
          required
          error={errors.fullName}
        >
          <Input
            id="enquiry-name"
            name="fullName"
            autoComplete="name"
            required
            maxLength={LIMITS.name}
            value={values.fullName}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? 'enquiry-name-error' : undefined}
            onChange={(event) => set('fullName')(event.target.value)}
          />
        </Field>

        <Field id="enquiry-email" label="Work email" required error={errors.email}>
          <Input
            id="enquiry-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={LIMITS.email}
            value={values.email}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'enquiry-email-error' : undefined}
            onChange={(event) => set('email')(event.target.value)}
          />
        </Field>

        <Field id="enquiry-company" label="Company / agency name" optional>
          <Input
            id="enquiry-company"
            name="company"
            autoComplete="organization"
            maxLength={LIMITS.company}
            value={values.company}
            onChange={(event) => set('company')(event.target.value)}
          />
        </Field>

        <Field id="enquiry-budget" label="Estimated monthly budget" optional>
          <Select
            id="enquiry-budget"
            name="budgetBand"
            value={values.budgetBand}
            onChange={(event) => set('budgetBand')(event.target.value)}
          >
            <option value="">Select a range</option>
            {BUDGET_BANDS.map((band) => (
              <option key={band} value={band}>
                {band}
              </option>
            ))}
          </Select>
        </Field>

        <div className="sm:col-span-2">
          <Field id="enquiry-interest" label="What are you interested in?" optional>
            <Select
              id="enquiry-interest"
              name="interest"
              value={values.interest}
              onChange={(event) => set('interest')(event.target.value)}
            >
              <option value="">Select an option</option>
              {INTERESTS.map((interest) => (
                <option key={interest} value={interest}>
                  {interest}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field
            id="enquiry-message"
            label="Your requirements"
            required
            error={errors.message}
          >
            <Textarea
              id="enquiry-message"
              name="message"
              rows={5}
              required
              maxLength={LIMITS.message}
              placeholder="How many placements, which niches or markets, and anything else that would help us answer."
              value={values.message}
              aria-invalid={Boolean(errors.message)}
              aria-describedby={errors.message ? 'enquiry-message-error' : undefined}
              onChange={(event) => set('message')(event.target.value)}
            />
          </Field>
        </div>
      </div>

      {/*
        The honeypot.

        Hidden from people and from screen readers, left empty by both, and
        filled by anything that walks the DOM looking for inputs. Chosen over
        a CAPTCHA deliberately: a CAPTCHA is a third-party script, a cookie
        and a tax on every real enquirer, to protect a form whose worst case
        is a row in a table only administrators read.

        `aria-hidden` with `tabIndex={-1}` rather than `display: none`, so a
        bot reading styles cannot tell it apart as cheaply.
      */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="enquiry-website">Website</label>
        <input
          id="enquiry-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(event) => set('website')(event.target.value)}
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
          {pending ? 'Sending...' : 'Request custom pricing'}
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
