/**
 * The service account that reads our mailboxes.
 *
 * Server only, and deliberately paranoid. Domain-wide delegation means this
 * key can open any mailbox in the workspace, so nothing here returns the key
 * itself to a caller, nothing logs it, and no error raised anywhere in this
 * feature is allowed to carry its contents.
 *
 * Kept apart from the client so "is Gmail configured?" can be answered on a
 * page without importing anything that makes a request.
 */

export const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

/**
 * Read only. Never anything else.
 *
 * The scope is granted in the Workspace admin console against this service
 * account's client ID, so widening it here would not grant anything by
 * itself - but the request would start failing, and the fix somebody reaches
 * for under pressure is to widen the grant. Narrow here keeps it narrow
 * there.
 */
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  client_id?: string;
  project_id?: string;
}

/**
 * The decoded key, or null.
 *
 * Null rather than a throw: every caller has something useful to say about a
 * missing key ("add it in Vercel") and nothing useful to say about a parse
 * error that might quote the key back. Malformed input is treated exactly
 * like absent input for that reason.
 */
export function serviceAccountKey(): ServiceAccountKey | null {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (!encoded) return null;

  try {
    const json = Buffer.from(encoded, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as Partial<ServiceAccountKey>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      client_email: parsed.client_email,
      // Vercel's UI turns real newlines into the two characters \ and n.
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
      client_id: parsed.client_id,
      project_id: parsed.project_id,
    };
  } catch {
    return null;
  }
}

export function isGmailConfigured(): boolean {
  return serviceAccountKey() !== null;
}

/**
 * The service account's address, for the setup page.
 *
 * Safe to show an admin: it is the public half of the identity and it is what
 * somebody needs in order to check the delegation was granted to the right
 * account. The private key is never returned by anything here.
 */
export function serviceAccountEmail(): string | null {
  return serviceAccountKey()?.client_email ?? null;
}

/** The numeric client ID the Workspace admin console asks for. */
export function serviceAccountClientId(): string | null {
  return serviceAccountKey()?.client_id ?? null;
}
