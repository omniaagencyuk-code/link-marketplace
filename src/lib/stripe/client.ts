import Stripe from 'stripe';
import { stripeSecretKey } from './config';

/**
 * The Stripe client.
 *
 * Returns null rather than throwing when no key is configured, so callers have
 * to decide what to do about it. Every one of them has a sensible answer -
 * usually "tell the customer checkout is unavailable" - which is better than
 * an exception from a module that happened to be imported.
 *
 * Cached on globalThis because the bundler hands some route groups their own
 * copy of a module, and there is no reason to hold several clients.
 */
const CLIENT = Symbol.for('pressparrot.stripe-client');

export function getStripe(): Stripe | null {
  const key = stripeSecretKey();
  if (!key) return null;

  const host = globalThis as typeof globalThis & { [CLIENT]?: Stripe };
  host[CLIENT] ??= new Stripe(key, {
    // Pinned. An account's default version can change under you, and a
    // payment integration is the last place to want that surprise.
    apiVersion: '2026-08-26.dahlia',
    appInfo: { name: 'Press Parrot' },
  });

  return host[CLIENT];
}
