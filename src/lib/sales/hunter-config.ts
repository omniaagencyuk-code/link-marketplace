/**
 * Hunter API credentials.
 *
 * Kept apart from the client so "is Hunter configured?" can be answered on a
 * page without importing anything that makes a request - the same arrangement
 * as `ahrefs/config.ts` and `gmail/config.ts`.
 *
 * Server only. The key buys data against a metered account, every call is
 * billed, and nothing here hands it to a caller: `isHunterConfigured()`
 * returns a boolean, and the key itself is read inside the request function
 * and never returned, logged or included in an error.
 */

export const HUNTER_API_BASE = 'https://api.hunter.io/v2';

export function hunterApiKey(): string | undefined {
  return process.env.HUNTER_API_KEY || undefined;
}

export function isHunterConfigured(): boolean {
  return Boolean(hunterApiKey());
}

/**
 * Keep the key out of anything anybody reads.
 *
 * Hunter takes its key as a query parameter, so the key is in the URL of every
 * request - which means the URL is a credential. An error message, a log line
 * or a status row that quotes the URL it called leaks it. This is applied to
 * anything from Hunter that could carry one before it is stored or printed.
 */
export function redactKey(text: string): string {
  return text.replace(/api_key=[^&\s"']+/gi, 'api_key=REDACTED');
}
