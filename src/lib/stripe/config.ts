/**
 * Stripe connection details.
 *
 * Kept apart from the SDK so that "is Stripe configured?" can be asked without
 * importing it - the checkout button needs that answer on every render, and
 * pulling the Node SDK into that path would be wasteful and, in a client
 * component, impossible.
 *
 * Mirrors the Supabase arrangement deliberately: with no keys the app runs
 * exactly as before rather than throwing, so a deployment without payments is
 * a working site with checkout disabled, not a broken one.
 */

/** Server-only. Never imported from anything a browser can reach. */
export function stripeSecretKey(): string | undefined {
  return process.env.STRIPE_SECRET_KEY || undefined;
}

/** Server-only. Used to prove a webhook really came from Stripe. */
export function stripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET || undefined;
}

/**
 * Whether checkout can actually run.
 *
 * Deliberately not exported to the browser as a public variable. The checkout
 * button asks the server, because whether payment is possible is a server
 * fact and a client-side flag would only ever be a guess about one.
 */
export function isStripeEnabled(): boolean {
  return Boolean(stripeSecretKey());
}

/**
 * Whether webhooks are verifiable.
 *
 * Separate from `isStripeEnabled` because the two are configured at different
 * moments: the secret key comes from the dashboard, the webhook secret only
 * exists once the endpoint has been created and pointed at a deployed URL.
 */
export function isStripeWebhookConfigured(): boolean {
  return Boolean(stripeWebhookSecret());
}
