import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent } from '@/components/ui/card';
import { SalesSettingsForm } from '@/components/admin/sales-settings-form';
import { salesSettingsService } from '@/lib/services/sales-settings-service';
import { isHunterConfigured } from '@/lib/sales/hunter-config';
import { isExtractionConfigured } from '@/lib/sourcing/client';
import { emailEnabled, emailFrom } from '@/lib/email/config';

/**
 * Sales settings.
 *
 * Everything that governs the outbound job lives in a row rather than in an
 * environment variable, so a cap can be changed without a redeploy - the same
 * arrangement `refresh_settings` uses, and for the same reason.
 *
 * The three keys are not settings and are not shown. They are read from the
 * environment on the server and this page says only whether each is present:
 * a settings screen that displays an API key is a settings screen that leaks
 * one to anybody looking over a shoulder.
 */

export const dynamic = 'force-dynamic';

export default async function SalesSettingsPage() {
  const [settings, spend] = await Promise.all([
    salesSettingsService.get().catch(() => null),
    salesSettingsService.spend().catch(() => null),
  ]);

  return (
    <>
      <PageTitle
        title="Sales settings"
        description="Caps, cadences and budgets. The guards read these, so a number here is what actually stops a run."
      />

      <Card className="mb-6">
        <CardContent className="py-4">
          <h2 className="mb-2 text-[13px] font-semibold text-ink">Keys on this deployment</h2>
          <ul className="space-y-1 text-[13px]">
            <Key
              name="ANTHROPIC_API_KEY"
              present={isExtractionConfigured()}
              what="qualifying prospects and writing emails"
            />
            <Key
              name="HUNTER_API_KEY"
              present={isHunterConfigured()}
              what="finding contacts"
            />
            <Key
              name="RESEND_API_KEY"
              present={emailEnabled()}
              what={`sending${emailEnabled() ? ` (as ${emailFrom()})` : ''}`}
            />
          </ul>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            Keys are read on the server and never shown here or sent to a browser. A missing one
            does not break anything - the sweep that needs it refuses and says which one.
          </p>
        </CardContent>
      </Card>

      {spend ? (
        <Card className="mb-6">
          <CardContent className="grid gap-4 py-4 sm:grid-cols-2">
            <div>
              <p className="text-[12px] font-medium tracking-wide text-muted uppercase">
                Hunter credits this cycle
              </p>
              <p className="tabular mt-1 text-xl font-semibold text-ink">
                {spend.hunterCreditsUsed.toLocaleString('en-GB')} of{' '}
                {spend.hunterCreditBudget.toLocaleString('en-GB')}
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                {spend.hunterCreditBudget === 0
                  ? 'The budget is zero, so every lookup is refused. That is how it ships: a budget nobody has entered is one nobody has agreed to spend.'
                  : `Lookups stop at ${spend.hunterCeiling.toLocaleString('en-GB')} - counted from what Hunter actually charged, not estimated.`}
              </p>
            </div>
            <div>
              <p className="text-[12px] font-medium tracking-wide text-muted uppercase">
                Model spend this month
              </p>
              <p className="tabular mt-1 text-xl font-semibold text-ink">
                ${spend.aiSpendUsd.toFixed(2)} of ${spend.aiBudgetUsd.toFixed(2)}
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                Summed from the tokens the API reported on every qualification and every draft.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {settings ? (
        <SalesSettingsForm settings={settings} />
      ) : (
        <p className="text-[13px] text-muted">
          No settings row. Run migration 0053 and reload.
        </p>
      )}
    </>
  );
}

function Key({ name, present, what }: { name: string; present: boolean; what: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <span
        className={
          present
            ? 'inline-flex h-2 w-2 shrink-0 translate-y-[-1px] rounded-full bg-accent-500'
            : 'inline-flex h-2 w-2 shrink-0 translate-y-[-1px] rounded-full bg-line-strong'
        }
        aria-hidden="true"
      />
      <code className="text-ink">{name}</code>
      <span className="text-muted">
        {present ? 'set' : 'not set'} - {what}
      </span>
    </li>
  );
}
