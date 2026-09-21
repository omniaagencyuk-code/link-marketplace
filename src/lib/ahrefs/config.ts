/**
 * Ahrefs API credentials.
 *
 * Kept apart from the client so "is Ahrefs configured?" can be answered
 * without importing it. Server-only: the token buys data against a metered
 * account and must never reach a browser.
 */

export const AHREFS_API_BASE = 'https://api.ahrefs.com/v3';

/** Ahrefs caps batch-analysis at 100 targets per call. */
export const AHREFS_MAX_BATCH = 100;

export function ahrefsToken(): string | undefined {
  return process.env.AHREFS_API_TOKEN || undefined;
}

export function isAhrefsConfigured(): boolean {
  return Boolean(ahrefsToken());
}

/**
 * The secret Vercel Cron presents when it calls the refresh endpoint.
 *
 * Without it the route is a public URL that spends money on request, so the
 * route refuses to run at all when this is unset rather than defaulting to
 * open.
 */
export function cronSecret(): string | undefined {
  return process.env.CRON_SECRET || undefined;
}
