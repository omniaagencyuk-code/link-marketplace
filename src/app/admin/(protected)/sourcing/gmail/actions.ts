'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { gmailImportService } from '@/lib/services/gmail-import-service';

/**
 * The Gmail importer, behind an admin session.
 *
 * `requireAdminSession()` is the first line of every action here, as in the
 * rest of the admin. It matters more than usual: these actions reach a
 * service account that can open any mailbox in the workspace, so an
 * unauthenticated POST reaching one of them would be a mail breach rather
 * than a data leak.
 *
 * No action takes a mailbox and uses it. Every address is passed through the
 * allowlist inside the service first, so a request naming an address nobody
 * added is answered with nothing rather than with that person's mail.
 */

async function adminEmail(): Promise<string | undefined> {
  const session = await requireAdminSession();
  return session.email ?? undefined;
}

export async function addMailboxAction(input: { address: string; label?: string }) {
  const by = await adminEmail();
  const result = await gmailImportService.addMailbox(input.address, input.label, by);
  revalidatePath('/admin/sourcing/gmail');
  return result;
}

export async function removeMailboxAction(address: string) {
  await requireAdminSession();
  await gmailImportService.removeMailbox(address);
  revalidatePath('/admin/sourcing/gmail');
  return { ok: true };
}

export async function setMailboxEnabledAction(address: string, enabled: boolean) {
  await requireAdminSession();
  await gmailImportService.setMailboxEnabled(address, enabled);
  revalidatePath('/admin/sourcing/gmail');
  return { ok: true };
}

export async function previewAction(input: {
  mailboxes: string[];
  query: string;
  labelFilter?: string;
  maxThreads: number;
}) {
  await requireAdminSession();
  const rows = await gmailImportService.preview({
    mailboxes: input.mailboxes,
    query: input.query,
    labelIds: input.labelFilter?.trim() ? [input.labelFilter.trim()] : undefined,
    cap: Math.max(1, Math.min(2000, Math.round(input.maxThreads))),
  });
  return { ok: true, rows };
}

export async function startImportAction(input: {
  mailboxes: string[];
  query: string;
  labelFilter?: string;
  maxThreads: number;
}) {
  const by = await adminEmail();
  const result = await gmailImportService.createJob({ ...input, startedBy: by });
  revalidatePath('/admin/sourcing/gmail');
  return result;
}

/**
 * One chunk of fetching.
 *
 * The page calls this in a loop while it is open. It is deliberately small
 * and deliberately safe to call again: the job holds a lease, so a double
 * click or a second tab does not fetch anything twice.
 */
export async function processChunkAction(jobId: string) {
  await requireAdminSession();
  const result = await gmailImportService.processChunk(jobId);
  if (result.done) revalidatePath('/admin/sourcing');
  return result;
}

export async function cancelImportAction(jobId: string) {
  await requireAdminSession();
  await gmailImportService.cancelJob(jobId);
  revalidatePath('/admin/sourcing/gmail');
  return { ok: true };
}
