/**
 * Reading whether this deployment can actually take money.
 *
 * Pure, and apart from the Stripe client on purpose: these are the
 * judgements, and every one of them was learned the hard way on the
 * afternoon the live keys went in. A readiness screen that reports what is
 * *configured* rather than what is *true* is how an integration spends a
 * day taking sandbox payments - the keys were set, the webhook existed, the
 * checkout worked, and none of it was real.
 */

/** The two events the webhook route acts on. Everything else it ignores. */
export const REQUIRED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
] as const;

export type KeyMode = 'live' | 'test' | 'none' | 'unrecognised';

/**
 * Live or test, from the key's prefix.
 *
 * The prefix is all that is read and all that is ever shown - the key
 * itself never reaches a screen, and this file never receives anything but
 * its first characters' worth of meaning.
 *
 * **A sandbox key is a test key.** Stripe's sandboxes issue `sk_test_`
 * exactly like classic test mode, so "not live" is the only distinction
 * worth drawing here, and it is the one that matters: a site running on
 * either takes no real money.
 */
export function keyMode(key: string | undefined): KeyMode {
  if (!key) return 'none';
  if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) return 'live';
  if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) return 'test';
  return 'unrecognised';
}

export interface WebhookVerdict {
  /** An endpoint whose URL is the one this deployment answers on. */
  found: boolean;
  /** Enabled, as far as Stripe is concerned. */
  enabled: boolean;
  /** Required events the endpoint is not subscribed to. */
  missingEvents: string[];
  /** Endpoints pointing somewhere else, which are somebody else's problem. */
  others: number;
}

export interface EndpointLike {
  url?: string | null;
  status?: string | null;
  enabled_events?: string[] | null;
}

/**
 * Does Stripe hold an endpoint pointing at this deployment, for both events?
 *
 * Compared on the URL because that is the only half of the arrangement
 * Stripe will show us. **The signing secret cannot be checked from here** -
 * Stripe returns it once, at creation - so a matching endpoint means the
 * events are pointed at the right place and nothing more. Whether the
 * secret in the environment is *that* endpoint's secret is answered only by
 * a delivery arriving and verifying, which is why the screen reports the
 * last one received beside this.
 *
 * `*` counts as subscribing to everything, because it does.
 */
export function readWebhooks(endpoints: EndpointLike[], expectedUrl: string): WebhookVerdict {
  const wanted = expectedUrl.replace(/\/$/, '').toLowerCase();
  const mine = endpoints.filter(
    (endpoint) => (endpoint.url ?? '').replace(/\/$/, '').toLowerCase() === wanted,
  );

  if (mine.length === 0) {
    return {
      found: false,
      enabled: false,
      missingEvents: [...REQUIRED_WEBHOOK_EVENTS],
      others: endpoints.length,
    };
  }

  // Several endpoints may point here - one per event, say. What matters is
  // whether the two events are covered between them, by an enabled one.
  const enabled = mine.filter((endpoint) => (endpoint.status ?? 'enabled') === 'enabled');
  const covered = new Set(enabled.flatMap((endpoint) => endpoint.enabled_events ?? []));

  return {
    found: true,
    enabled: enabled.length > 0,
    missingEvents: covered.has('*')
      ? []
      : REQUIRED_WEBHOOK_EVENTS.filter((event) => !covered.has(event)),
    others: endpoints.length - mine.length,
  };
}

export type Verdict = 'ok' | 'warn' | 'bad' | 'unknown';

/**
 * The one sentence at the top of the screen.
 *
 * Deliberately harsh about a test key on a live site. Everything else can
 * be wrong and be discovered by a customer complaining; a test key is
 * wrong in a way that looks entirely fine from the inside - which is
 * exactly what happened here.
 */
export function overallVerdict(checks: { verdict: Verdict }[]): Verdict {
  if (checks.some((check) => check.verdict === 'bad')) return 'bad';
  if (checks.some((check) => check.verdict === 'warn')) return 'warn';
  if (checks.some((check) => check.verdict === 'unknown')) return 'unknown';
  return 'ok';
}
