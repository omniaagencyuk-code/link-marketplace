'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SalesForm } from '@/components/admin/sales-controls';
import { saveSalesSettingsAction } from '@/app/admin/(protected)/sales/actions';
import type { SalesSettings } from '@/lib/types/sales';

/**
 * The numbers behind the guards.
 *
 * Each field's hint says what the number actually does, not what it is called.
 * "Daily send cap" is obvious; that it is the difference between outbound and
 * a mail provider deciding we are a spam source is not, and the person
 * changing it from 40 to 400 is the person who needs to know.
 */
export function SalesSettingsForm({ settings }: { settings: SalesSettings }) {
  return (
    <Card>
      <CardContent className="py-5">
        <SalesForm
          action={saveSalesSettingsAction}
          submitLabel="Save settings"
          confirm={undefined}
        >
          <h2 className="mb-3 text-[13px] font-semibold text-ink">Spending</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              name="hunterMonthlyCreditBudget"
              label="Hunter credit budget"
              value={settings.hunterMonthlyCreditBudget}
              hint="Per cycle. Zero refuses every lookup, which is how it ships."
            />
            <Field
              name="hunterCreditSafetyPct"
              label="Stop at (% of credits)"
              value={settings.hunterCreditSafetyPct}
              hint="Lookups stop here, not at the budget - the account is shared with whatever else uses it."
            />
            <Field
              name="hunterCycleDay"
              label="Credits reset on day"
              value={settings.hunterCycleDay}
              hint="1-28."
            />
            <Field
              name="monthlyAiBudgetUsd"
              label="Model budget (USD)"
              value={settings.monthlyAiBudgetUsd}
              hint="Qualifying and writing. Measured from reported tokens."
              step="0.01"
            />
            <Field
              name="model"
              label="Model"
              value={settings.model}
              text
              hint="Used for both qualifying and writing."
            />
          </div>

          <h2 className="mt-6 mb-3 text-[13px] font-semibold text-ink">Sending</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              name="sendFrom"
              label="Send from"
              value={settings.sendFrom ?? ''}
              text
              hint="Must be a verified sender at the mail provider. A send run refuses without it."
            />
            <Field
              name="sendReplyTo"
              label="Reply to"
              value={settings.sendReplyTo ?? ''}
              text
              hint="Where replies land. Leave blank to use the from address."
            />
            <Field
              name="dailySendCap"
              label="Daily send cap"
              value={settings.dailySendCap}
              hint="The difference between outbound and a mail provider deciding we are a spam source."
            />
            <Field
              name="perDomainOpenCap"
              label="In flight per company"
              value={settings.perDomainOpenCap}
              hint="Keep at 1. Two means one business hears from us twice in a morning."
            />
            <Field
              name="maxFollowUps"
              label="Follow-ups"
              value={settings.maxFollowUps}
              hint="After the first email. Zero turns follow-ups off."
            />
            <Field
              name="followUpGapDays"
              label="Days between"
              value={settings.followUpGapDays}
              hint="A follow-up is never written to anybody who replied."
            />
          </div>

          <h2 className="mt-6 mb-3 text-[13px] font-semibold text-ink">Who gets worked</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              name="minScoreToContact"
              label="Minimum score to contact"
              value={settings.minScoreToContact}
              hint="Below this, no Hunter credit is spent and no email is written."
            />
            <Field
              name="crawlMaxPages"
              label="Pages to read per site"
              value={settings.crawlMaxPages}
              hint="1-20. Six is the homepage plus whichever of services, pricing, about, clients and blog exist."
            />
          </div>
        </SalesForm>
      </CardContent>
    </Card>
  );
}

function Field({
  name,
  label,
  value,
  hint,
  text,
  step,
}: {
  name: string;
  label: string;
  value: number | string;
  hint?: string;
  text?: boolean;
  step?: string;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <div className="mt-1.5">
        <Input
          id={name}
          name={name}
          type={text ? 'text' : 'number'}
          min={text ? undefined : 0}
          step={step}
          defaultValue={value}
        />
      </div>
      {hint ? <p className="mt-1 text-[12px] leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}
