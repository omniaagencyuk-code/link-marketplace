import { getStripe } from '@/lib/stripe/client';
import { stripeSecretKey, stripeWebhookSecret } from '@/lib/stripe/config';
import {
  keyMode,
  overallVerdict,
  readWebhooks,
  REQUIRED_WEBHOOK_EVENTS,
  type Verdict,
} from '@/lib/stripe/readiness-rules';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { getAdminScopedClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/config/brand';

/**
 * Can this deployment take real money, and how would we know?
 *
 * Written after an afternoon in which every answer on the configuration
 * screen would have been yes while the site took nothing but sandbox
 * payments. The keys were set. The webhook existed. Checkout opened,
 * charged a card and returned. All of it was fake, and the only thing that
 * said so was a `cs_test_` in a URL nobody looks at.
 *
 * So this asks Stripe rather than the environment wherever it can. "A
 * secret key is present" is worth almost nothing; "Stripe says this account
 * can accept charges, in live mode, with tax active and an endpoint
 * pointing at our URL" is worth the five calls it costs.
 *
 * ## What it cannot tell you
 *
 * Whether `STRIPE_WEBHOOK_SECRET` is the secret of the endpoint it found.
 * Stripe shows a signing secret once, at creation, and never again. The
 * only proof is a delivery arriving and verifying - which is why the last
 * event we accepted is reported beside it, from our own table. A webhook
 * that has never delivered is the gap where a sandbox secret hides.
 */

export interface ReadinessCheck {
  label: string;
  verdict: Verdict;
  detail: string;
}

export interface StripeReadiness {
  verdict: Verdict;
  checks: ReadinessCheck[];
}

/** Never throws: a readiness screen that errors tells you nothing at all. */
async function attempt<T>(run: () => Promise<T>): Promise<{ value?: T; error?: string }> {
  try {
    return { value: await run() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Stripe did not answer' };
  }
}

export async function stripeReadiness(): Promise<StripeReadiness> {
  const checks: ReadinessCheck[] = [];
  const mode = keyMode(stripeSecretKey());

  /*
    The first row, and the one that would have saved the afternoon. A test
    or sandbox key is not a misconfiguration anybody notices: the site
    works, checkout opens, a card is accepted. It simply never takes money.
  */
  checks.push({
    label: 'Secret key',
    verdict: mode === 'live' ? 'ok' : mode === 'none' ? 'bad' : 'warn',
    detail:
      mode === 'live'
        ? 'A live key, so charges are real.'
        : mode === 'test'
          ? 'A test or sandbox key. Checkout will work and take no money - sandbox keys look exactly like test keys, so check which environment it came from.'
          : mode === 'none'
            ? 'Not set. Checkout is switched off and the basket says payments are unavailable.'
            : 'Set, but not a shape Stripe uses. Nothing will authenticate.',
  });

  const stripe = getStripe();
  if (!stripe) {
    return { verdict: 'bad', checks };
  }

  // ------------------------------------------------- what Stripe says back
  /*
    Three independent questions, asked at once. This is an admin screen and
    five sequential round trips to Stripe is most of a second for nothing -
    the same arithmetic the timings below this panel exist to teach.

    The account is `retrieveCurrent`, which means the account this key
    belongs to; that is the question being asked - what can *this* key do.
  */
  const [account, tax, endpoints] = await Promise.all([
    attempt(() => stripe.accounts.retrieveCurrent()),
    attempt(() => stripe.tax.settings.retrieve()),
    attempt(() => stripe.webhookEndpoints.list({ limit: 50 })),
  ]);
  checks.push({
    label: 'Account',
    verdict: account.error
      ? 'bad'
      : account.value?.charges_enabled
        ? 'ok'
        : 'bad',
    detail: account.error
      ? `Stripe refused the key: ${account.error}`
      : account.value?.charges_enabled
        ? `${account.value.business_profile?.name ?? account.value.id} in ${(account.value.country ?? '??').toUpperCase()}, charges enabled${account.value.payouts_enabled ? ' and payouts enabled' : ' but payouts are not enabled yet'}.`
        : 'Stripe will not accept charges on this account yet - activation is unfinished.',
  });

  /*
    Tax is checked because the session is created with `automatic_tax`
    enabled, so Stripe refuses to open checkout at all without an origin
    address. The customer sees "We could not open checkout just now" and
    nothing anywhere says the word tax.
  */
  checks.push({
    label: 'Stripe Tax',
    verdict: tax.error ? 'unknown' : tax.value?.status === 'active' ? 'ok' : 'bad',
    detail: tax.error
      ? `Could not read the tax settings: ${tax.error}`
      : tax.value?.status === 'active'
        ? `Active, head office ${(tax.value.head_office?.address?.country ?? '??').toUpperCase()}. Checkout sends automatic_tax, so this has to stay active.`
        : 'Not active. Checkout will refuse to open, because every session asks Stripe to work out the tax.',
  });

  // ------------------------------------------------------------- the webhook
  const expected = `${siteUrl.replace(/\/$/, '')}/api/stripe/webhook`;
  const verdict = endpoints.value ? readWebhooks(endpoints.value.data, expected) : null;

  checks.push({
    label: 'Webhook endpoint',
    verdict: endpoints.error
      ? 'unknown'
      : verdict?.found && verdict.enabled && verdict.missingEvents.length === 0
        ? 'ok'
        : 'bad',
    detail: endpoints.error
      ? `Could not list the endpoints: ${endpoints.error}`
      : !verdict?.found
        ? `Nothing in this mode points at ${expected}. Paid orders will never be marked paid.${verdict?.others ? ` (${verdict.others} endpoint(s) point elsewhere.)` : ''}`
        : !verdict.enabled
          ? 'An endpoint exists for this URL but Stripe has it disabled.'
          : verdict.missingEvents.length > 0
            ? `Pointing here, but not subscribed to ${verdict.missingEvents.join(' or ')}.`
            : `Pointing here and subscribed to both events.`,
  });

  checks.push({
    label: 'Webhook secret',
    verdict: stripeWebhookSecret() ? 'ok' : 'bad',
    detail: stripeWebhookSecret()
      ? 'Set. Whether it is this endpoint’s secret cannot be read back from Stripe - the row below is the only proof.'
      : 'Not set, so every delivery is refused and no order is ever marked paid.',
  });

  /*
    The proof. A signature that verified is the one thing that says the
    stored secret belongs to the endpoint Stripe is delivering to, and no
    amount of configuration can stand in for it.
  */
  if (isSupabaseEnabled()) {
    const last = await attempt(async () => {
      const supabase = getAdminScopedClient();
      const { data } = await supabase
        .from('stripe_events')
        .select('id, type, received_at')
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { type: string; received_at: string } | null;
    });

    checks.push({
      label: 'Last delivery accepted',
      verdict: last.error ? 'unknown' : last.value ? 'ok' : 'warn',
      detail: last.error
        ? `Could not read the event log: ${last.error}`
        : last.value
          ? `${last.value.type} at ${new Date(last.value.received_at).toUTCString()}. A verified signature, so the stored secret is the right one.`
          : `Nothing has ever been delivered and verified. Until one is, ${REQUIRED_WEBHOOK_EVENTS[0]} arriving is untested.`,
    });
  }

  return { verdict: overallVerdict(checks), checks };
}
