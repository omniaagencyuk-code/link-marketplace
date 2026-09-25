/**
 * Whether we can send mail, and who from.
 *
 * Off unless configured, like every other outside service here. A deployment
 * with no key does not fail and does not pretend to have sent anything - it
 * records that it could not, which is a different and more useful state than
 * silence.
 */

export function resendApiKey(): string | undefined {
  const key = process.env.RESEND_API_KEY?.trim();
  return key || undefined;
}

/**
 * The From address.
 *
 * A real address rather than noreply@, because the whole point of these
 * messages is a customer telling us something is wrong, and a reply that
 * bounces is a complaint we never hear.
 */
export function emailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || 'hello@pressparrot.com';
}

/** Where a customer's problem report lands. Falls back to the From address. */
export function emailToAdmin(supportEmail?: string): string {
  return process.env.EMAIL_ADMIN?.trim() || supportEmail || emailFrom();
}

export function emailEnabled(): boolean {
  return Boolean(resendApiKey());
}
