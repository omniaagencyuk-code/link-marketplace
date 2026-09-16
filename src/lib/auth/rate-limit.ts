import { headers } from 'next/headers';
import { getAdminClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';

/**
 * Throttling for the endpoints worth attacking.
 *
 * Sign-in, sign-up and password reset are the doors into the product, and
 * until now they were unthrottled. The counter lives in Postgres because the
 * app runs on serverless instances: a module-level Map is per-instance, so
 * spreading requests across instances would sail past any limit while looking
 * like it was protected.
 *
 * Limiting is by IP and action. Deliberately not by email: an email-keyed
 * limit lets anyone lock a known customer out of their own account by failing
 * sign-in on their behalf, which trades a brute-force risk for a denial of
 * service one.
 *
 * Failures here are fail-open. If the table is unreachable, sign-in still
 * works - refusing every customer because a throttle counter hiccupped is a
 * worse outcome than briefly losing the throttle.
 */

export interface RateLimitRule {
  /** Distinguishes counters, e.g. "sign-in". */
  action: string;
  /** Attempts allowed inside the window. */
  max: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  signIn: { action: 'sign-in', max: 10, windowSeconds: 300 },
  signUp: { action: 'sign-up', max: 5, windowSeconds: 3600 },
  passwordReset: { action: 'password-reset', max: 5, windowSeconds: 3600 },
  passwordUpdate: { action: 'password-update', max: 10, windowSeconds: 3600 },
  adminSignIn: { action: 'admin-sign-in', max: 5, windowSeconds: 900 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. Zero when allowed. */
  retryAfterSeconds: number;
}

const ALLOWED: RateLimitResult = { allowed: true, retryAfterSeconds: 0 };

/**
 * The caller's address.
 *
 * Vercel sets `x-forwarded-for` and strips any client-supplied copy, so the
 * first entry is the real peer. Behind a different proxy this could be
 * spoofable, which is worth knowing: it would weaken the throttle, not any
 * other control.
 */
async function callerKey(): Promise<string> {
  const store = await headers();
  const forwarded = store.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return store.get('x-real-ip') ?? 'unknown';
}

/**
 * In-memory fallback for when there is no database.
 *
 * Only reached in mock mode, where there are no real credentials to protect.
 * Keyed off globalThis so every copy of the module shares one map.
 */
const MEMORY = Symbol.for('pressparrot.rate-limit');

function memoryStore(): Map<string, { count: number; expiresAt: number }> {
  const host = globalThis as typeof globalThis & {
    [MEMORY]?: Map<string, { count: number; expiresAt: number }>;
  };
  host[MEMORY] ??= new Map();
  return host[MEMORY];
}

function consumeInMemory(bucket: string, rule: RateLimitRule): RateLimitResult {
  const store = memoryStore();
  const now = Date.now();
  const existing = store.get(bucket);

  if (!existing || existing.expiresAt <= now) {
    store.set(bucket, { count: 1, expiresAt: now + rule.windowSeconds * 1000 });
    return ALLOWED;
  }

  existing.count += 1;
  if (existing.count > rule.max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
    };
  }
  return ALLOWED;
}

/**
 * Record an attempt and report whether it may proceed.
 *
 * Call once per attempt, before doing the work - including before the
 * credential check, so a wrong password still counts.
 */
export async function consumeRateLimit(rule: RateLimitRule): Promise<RateLimitResult> {
  const bucket = `${rule.action}:${await callerKey()}`;

  if (!isSupabaseEnabled()) return consumeInMemory(bucket, rule);

  const supabase = getAdminClient();
  if (!supabase) return consumeInMemory(bucket, rule);

  try {
    const { data, error } = await supabase.rpc('consume_rate_limit', {
      p_bucket: bucket,
      p_max: rule.max,
      p_window_seconds: rule.windowSeconds,
    });

    if (error) return ALLOWED;

    const retryAfter = typeof data === 'number' ? data : 0;
    return retryAfter > 0
      ? { allowed: false, retryAfterSeconds: retryAfter }
      : ALLOWED;
  } catch {
    return ALLOWED;
  }
}

/** A message for a blocked attempt, in the units a person thinks in. */
export function rateLimitMessage(result: RateLimitResult): string {
  const seconds = result.retryAfterSeconds;
  if (seconds <= 90) {
    return `Too many attempts. Try again in ${Math.max(1, Math.round(seconds))} seconds.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
