'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { prospectService } from '@/lib/services/prospect-service';
import { salesSettingsService } from '@/lib/services/sales-settings-service';
import { salesContactService } from '@/lib/services/sales-contact-service';
import { salesEmailService } from '@/lib/services/sales-email-service';
import { salesAttributionService } from '@/lib/services/sales-attribution-service';
import { salesReplyService } from '@/lib/services/sales-reply-service';
import { salesFollowUpService } from '@/lib/services/sales-followup-service';
import {
  advanceResearchSweep,
  researchProspect,
  startResearchSweep,
} from '@/lib/services/sales-research-service';
import {
  advanceQualifySweep,
  qualifyProspect,
  startQualifySweep,
} from '@/lib/services/sales-qualify-service';
import { normaliseDomain } from '@/lib/import/normalise';
import type { ProspectStage, ReplyClassification, SalesSegment } from '@/lib/types/sales';

/**
 * Everything the Sales Centre pages can do.
 *
 * Every action calls `requireAdminSession()` first, without exception. Server
 * actions have their own endpoints and are reachable without rendering a page,
 * so `proxy.ts` gating `/admin` is not the check that matters - this is. The
 * signed-in address is then used as the actor on every row written, which is
 * what makes "who approved this" answerable.
 *
 * Nothing here returns a credential, a token or a prospect's internal id to
 * the browser beyond the ids the pages already hold, and nothing logs one.
 */

export interface SalesActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

const ok = (message: string): SalesActionResult => ({ ok: true, message });
const bad = (error: string): SalesActionResult => ({ ok: false, error });

/** Turn whatever went wrong into a sentence, never a stack trace. */
function reasonFor(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : 'Something went wrong.';
}

export async function saveSalesSettingsAction(formData: FormData): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  const number = (name: string) => {
    const raw = formData.get(name);
    if (raw === null || raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const text = (name: string) => {
    const raw = formData.get(name);
    return raw === null ? undefined : String(raw).trim();
  };

  try {
    await salesSettingsService.update(
      {
        model: text('model') || undefined,
        monthlyAiBudgetUsd: number('monthlyAiBudgetUsd'),
        hunterMonthlyCreditBudget: number('hunterMonthlyCreditBudget'),
        hunterCreditSafetyPct: number('hunterCreditSafetyPct'),
        hunterCycleDay: number('hunterCycleDay'),
        dailySendCap: number('dailySendCap'),
        perDomainOpenCap: number('perDomainOpenCap'),
        maxFollowUps: number('maxFollowUps'),
        followUpGapDays: number('followUpGapDays'),
        sendFrom: text('sendFrom'),
        sendReplyTo: text('sendReplyTo'),
        crawlMaxPages: number('crawlMaxPages'),
        minScoreToContact: number('minScoreToContact'),
      },
      session.email,
    );

    revalidatePath('/admin/sales/settings');
    return ok('Saved.');
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function setSalesEnabledAction(enabled: boolean): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    await salesSettingsService.update({ enabled }, session.email);
    revalidatePath('/admin/sales');
    revalidatePath('/admin/sales/settings');
    return ok(enabled ? 'The Sales Centre is on.' : 'The Sales Centre is off.');
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function setSalesDryRunAction(dryRun: boolean): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    await salesSettingsService.update({ dryRun }, session.email);
    revalidatePath('/admin/sales');
    revalidatePath('/admin/sales/settings');
    return ok(
      dryRun
        ? 'Dry run is on. Nothing will be sent and no Hunter credit will be spent.'
        : 'Dry run is off. Runs will send real email and spend real credits.',
    );
  } catch (error) {
    return bad(reasonFor(error));
  }
}

/**
 * Add prospects from a pasted list.
 *
 * One per line, `domain` or `Company Name, domain`. Deliberately not a file
 * upload: the thing people actually have is a column copied out of a
 * spreadsheet, and asking them to save it as a CSV first is asking them to do
 * a conversion so this form does not have to.
 */
export async function addProspectsAction(formData: FormData): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  const raw = String(formData.get('domains') ?? '').trim();
  const segment = (String(formData.get('segment') ?? 'other') || 'other') as SalesSegment;

  if (!raw) return bad('Paste at least one domain.');

  const entries = raw
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // "Company Name, domain.com" or "domain.com". The last comma-separated
      // field that looks like a domain is the domain; the rest is the name.
      const parts = line.split(/[,\t]/).map((part) => part.trim()).filter(Boolean);
      if (parts.length === 1) return { domain: parts[0]!, companyName: undefined };

      const domainPart = [...parts].reverse().find((part) => normaliseDomain(part));
      const name = parts.filter((part) => part !== domainPart).join(' ');
      return { domain: domainPart ?? parts[parts.length - 1]!, companyName: name || undefined };
    });

  try {
    const outcome = await prospectService.importDomains(entries, {
      segment,
      source: 'csv',
      sourceDetail: `Pasted by ${session.email}`,
      actor: session.email,
    });

    revalidatePath('/admin/sales/prospects');

    const parts = [`${outcome.added} added`];
    if (outcome.duplicates > 0) parts.push(`${outcome.duplicates} already there`);
    if (outcome.rejected.length > 0) {
      parts.push(
        `${outcome.rejected.length} not usable (${outcome.rejected
          .slice(0, 3)
          .map((entry) => entry.value)
          .join(', ')})`,
      );
    }

    return ok(`${parts.join(', ')}.`);
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function researchProspectAction(prospectId: string): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    const settings = await salesSettingsService.get();
    const outcome = await researchProspect(prospectId, {
      maxPages: settings?.crawlMaxPages ?? 6,
      actor: session.email,
    });

    revalidatePath(`/admin/sales/prospects/${prospectId}`);
    return outcome.ok
      ? ok(`Read ${outcome.pages} page${outcome.pages === 1 ? '' : 's'}.`)
      : bad(outcome.error ?? 'Could not read their site.');
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function qualifyProspectAction(prospectId: string): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    const outcome = await qualifyProspect(prospectId, { actor: session.email });
    revalidatePath(`/admin/sales/prospects/${prospectId}`);

    if (!outcome.ok) return bad(outcome.error ?? 'Could not read them.');

    return ok(
      `${outcome.verdict?.replace(/_/g, ' ')}` +
        (outcome.quotesDropped
          ? ` - ${outcome.quotesDropped} unverifiable quote${outcome.quotesDropped === 1 ? '' : 's'} dropped`
          : ''),
    );
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function findContactsAction(prospectId: string): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    const outcome = await salesContactService.findContacts(prospectId, session.email);
    revalidatePath(`/admin/sales/prospects/${prospectId}`);

    if (!outcome.ok) return bad(outcome.error ?? 'Hunter returned nothing.');
    if (outcome.found === 0) return ok('Hunter knows nobody at that domain.');

    return ok(
      `Found ${outcome.found}` +
        (outcome.selected ? `, writing to ${outcome.selected}` : '') +
        ` (${outcome.creditsCharged} credit${outcome.creditsCharged === 1 ? '' : 's'}).`,
    );
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function addContactAction(formData: FormData): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  const prospectId = String(formData.get('prospectId') ?? '');
  const email = String(formData.get('email') ?? '');

  try {
    const outcome = await salesContactService.addContact(
      prospectId,
      {
        email,
        fullName: String(formData.get('fullName') ?? '') || undefined,
        role: String(formData.get('role') ?? '') || undefined,
      },
      session.email,
    );

    revalidatePath(`/admin/sales/prospects/${prospectId}`);
    return outcome.ok ? ok('Added, and set as the recipient.') : bad(outcome.error ?? 'Could not add them.');
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function selectContactAction(
  prospectId: string,
  contactId: string,
): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    await prospectService.selectContact(prospectId, contactId, session.email);
    await salesContactService.rescore(prospectId);
    revalidatePath(`/admin/sales/prospects/${prospectId}`);
    return ok('Recipient changed.');
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function draftEmailAction(prospectId: string): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    const outcome = await salesEmailService.draft(prospectId, { actor: session.email });

    revalidatePath(`/admin/sales/prospects/${prospectId}`);
    revalidatePath('/admin/sales/review');

    if (!outcome.ok) return bad(outcome.error ?? 'Could not write it.');

    return ok(
      outcome.problems && outcome.problems.length > 0
        ? `Drafted, with ${outcome.problems.length} thing${
            outcome.problems.length === 1 ? '' : 's'
          } to check before it goes.`
        : 'Drafted. It is in the review queue.',
    );
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function editEmailAction(formData: FormData): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  const id = String(formData.get('emailId') ?? '');

  try {
    const outcome = await salesEmailService.edit(
      id,
      {
        subject: String(formData.get('subject') ?? '') || undefined,
        bodyText: String(formData.get('bodyText') ?? '') || undefined,
      },
      session.email,
    );

    revalidatePath('/admin/sales/review');

    if (!outcome.ok) return bad(outcome.error ?? 'Could not save it.');

    return outcome.problems && outcome.problems.length > 0
      ? ok(`Saved, but still ${outcome.problems.length} thing${outcome.problems.length === 1 ? '' : 's'} to check.`)
      : ok('Saved.');
  } catch (error) {
    return bad(reasonFor(error));
  }
}

/**
 * Approve one email.
 *
 * The approver's address goes on the row because the database demands it: the
 * trigger on `outbound_emails` refuses the transition without one. A refusal
 * reaching here is not a bug to work around - it means the address was
 * suppressed between the draft being written and this click, and the message
 * is passed through rather than tidied away.
 */
export async function approveEmailAction(emailId: string): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    const outcome = await salesEmailService.approve(emailId, session.email);

    revalidatePath('/admin/sales/review');
    revalidatePath('/admin/sales');

    return outcome.ok
      ? ok('Approved. It goes out on the next send.')
      : bad(outcome.error ?? 'Could not approve it.');
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function cancelEmailAction(emailId: string): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    const outcome = await salesEmailService.cancel(emailId, session.email, 'Cancelled in review');
    revalidatePath('/admin/sales/review');
    return outcome.ok ? ok('Cancelled.') : bad(outcome.error ?? 'Could not cancel it.');
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function setStageAction(
  prospectId: string,
  stage: ProspectStage,
): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    await prospectService.setStage(prospectId, stage, session.email);
    revalidatePath(`/admin/sales/prospects/${prospectId}`);
    revalidatePath('/admin/sales/prospects');

    return ok(
      stage === 'unsubscribed'
        ? 'Marked unsubscribed, and the whole domain is now suppressed.'
        : `Moved to ${stage.replace(/_/g, ' ')}.`,
    );
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function suppressAction(formData: FormData): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  const value = String(formData.get('value') ?? '').trim();
  if (!value) return bad('Enter an address or a domain.');

  try {
    if (value.includes('@')) {
      await prospectService.suppressEmail(value, 'do_not_contact', session.email);
    } else {
      await prospectService.suppressDomain(value, 'do_not_contact', session.email);
    }

    revalidatePath('/admin/sales/suppressions');
    return ok(`${value} will not be contacted.`);
  } catch (error) {
    return bad(reasonFor(error));
  }
}

/**
 * Start a sweep, and do the first slice.
 *
 * The first slice runs here so something visibly happens when the button is
 * pressed. The cron does the rest, which is what lets somebody start a sweep
 * over four hundred companies and close the tab.
 */
export async function startSweepAction(
  kind: 'research' | 'qualify' | 'contacts' | 'draft',
): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    const starters = {
      research: () => startResearchSweep(session.email),
      qualify: () => startQualifySweep(session.email),
      contacts: () => salesContactService.startSweep(session.email),
      draft: () => salesFollowUpService.startSweep(session.email),
    } as const;

    const runId = await starters[kind]();
    if (!runId) return bad('One is already going. Wait for it to finish.');

    revalidatePath('/admin/sales');

    // One slice now, bounded well inside a server action's limit, so the page
    // shows movement. Whatever is left is the cron's.
    const SLICE_MS = 20_000;
    if (kind === 'research') await advanceResearchSweep(SLICE_MS);
    if (kind === 'qualify') await advanceQualifySweep(SLICE_MS);
    if (kind === 'contacts') await salesContactService.advanceSweep(SLICE_MS);
    if (kind === 'draft') await salesFollowUpService.advanceSweep(SLICE_MS);

    revalidatePath('/admin/sales');
    return ok('Started. It carries on in the background - you can close this page.');
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function startSendRunAction(): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    const runId = await salesEmailService.startSendRun(session.email);
    if (!runId) return bad('A send is already going.');

    const outcome = await salesEmailService.advanceSendRun(20_000);
    revalidatePath('/admin/sales');
    revalidatePath('/admin/sales/review');

    if (outcome.wouldSend > 0) {
      return ok(
        `Dry run: ${outcome.wouldSend} email${outcome.wouldSend === 1 ? '' : 's'} would have gone. ` +
          `Turn dry run off to send them.`,
      );
    }

    return ok(
      `Sent ${outcome.sent}` +
        (outcome.failed > 0 ? `, ${outcome.failed} failed` : '') +
        (outcome.reason ? ` - ${outcome.reason}` : '') +
        '.',
    );
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function matchAttributionsAction(): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    const outcome = await salesAttributionService.match(session.email);
    revalidatePath('/admin/sales');
    return ok(
      `Checked ${outcome.checked} customers, matched ${outcome.created} new one${
        outcome.created === 1 ? '' : 's'
      }.`,
    );
  } catch (error) {
    return bad(reasonFor(error));
  }
}

/**
 * Log a reply somebody received in their own mail client.
 *
 * Here because most teams read replies in Gmail, not in an admin panel, and a
 * reply nobody records is a reply that neither stops a follow-up nor moves a
 * pipeline. Pasting it in does both - and an unsubscribe pasted in here
 * suppresses the company exactly as one that arrived automatically would.
 */
export async function logReplyAction(formData: FormData): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    const outcome = await salesReplyService.logByHand({
      fromAddress: String(formData.get('fromAddress') ?? ''),
      subject: String(formData.get('subject') ?? '') || undefined,
      body: String(formData.get('body') ?? ''),
      actor: session.email,
    });

    revalidatePath('/admin/sales/inbox');
    if (!outcome.ok) return bad(outcome.error ?? 'Could not log it.');

    return ok(
      `Logged, read as "${outcome.classification?.replace(/_/g, ' ')}"` +
        (outcome.classification === 'unsubscribe'
          ? '. The whole company is now suppressed.'
          : '.'),
    );
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function reclassifyReplyAction(
  replyId: string,
  classification: ReplyClassification,
): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    const outcome = await salesReplyService.reclassify(replyId, classification, session.email);
    revalidatePath('/admin/sales/inbox');

    return outcome.ok
      ? ok(
          classification === 'unsubscribe'
            ? 'Changed, and the company is now suppressed.'
            : 'Changed.',
        )
      : bad(outcome.error ?? 'Could not change it.');
  } catch (error) {
    return bad(reasonFor(error));
  }
}

export async function markReplyHandledAction(replyId: string): Promise<SalesActionResult> {
  const session = await requireAdminSession();

  try {
    const outcome = await salesReplyService.markHandled(replyId, session.email);
    revalidatePath('/admin/sales/inbox');
    return outcome.ok ? ok('Marked as dealt with.') : bad(outcome.error ?? 'Could not mark it.');
  } catch (error) {
    return bad(reasonFor(error));
  }
}
