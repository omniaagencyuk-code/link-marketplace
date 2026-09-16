'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { getServerClient } from '@/lib/supabase/server';

/**
 * Granting and removing admin access.
 *
 * The decision is made in the database, not here: `grant_admin` and
 * `revoke_admin` both check `is_admin()` themselves and refuse otherwise, so
 * calling them through the *user's* client is deliberate. A shared-password
 * admin has no Supabase identity, so those functions will refuse them - which
 * is the right answer. Handing out admin is exactly the operation that should
 * require an identity the database can see.
 *
 * `revoke_admin` also refuses to remove the last administrator, so this cannot
 * be used to strand the account.
 */

export interface RoleActionResult {
  ok: boolean;
  error?: string;
}

async function callRoleFunction(
  fn: 'grant_admin' | 'revoke_admin',
  email: string,
): Promise<RoleActionResult> {
  const session = await requireAdminSession();

  if (!isSupabaseEnabled()) {
    return { ok: false, error: 'Roles are managed in the database. Connect Supabase first.' };
  }

  if (session.source !== 'supabase') {
    return {
      ok: false,
      error:
        'Sign in with your own team account to change roles. The shared password has no identity the database can check.',
    };
  }

  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc(fn, { p_email: email });

  if (error) return { ok: false, error: error.message };
  if (data === false) return { ok: false, error: 'No account found for that address.' };

  revalidatePath('/admin/users');
  return { ok: true };
}

export async function grantAdminAction(email: string): Promise<RoleActionResult> {
  return callRoleFunction('grant_admin', email);
}

export async function revokeAdminAction(email: string): Promise<RoleActionResult> {
  return callRoleFunction('revoke_admin', email);
}
