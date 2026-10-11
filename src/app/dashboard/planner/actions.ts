'use server';

import { revalidatePath } from 'next/cache';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { plannerService } from '@/lib/services/planner-service';
import { domainKey, looksLikeDomain, monthStart } from '@/lib/planner/domain-key';
import { STATUS_CATEGORIES, type PlannerLinkPatch, type StatusCategory } from '@/lib/types/planner';

/**
 * Everything the planner writes.
 *
 * ## The session is the authorisation, every time
 *
 * Each action calls `requireCustomerSession` and passes that user's id to
 * the service, which filters on it as well as relying on the policy. No
 * action takes a user id from its caller: a planner holds an agency's
 * supplier prices, and an id in a form field is not an identity.
 *
 * ## Revalidation is deliberate, not reflexive
 *
 * `updateLinkAction` does not revalidate. It is called on every debounced
 * keystroke in a spreadsheet of twenty-five rows, and re-rendering the page
 * each time would re-read the month, the statuses and the project to put
 * back a value the browser already has - while the cursor jumps. It
 * returns the saved row instead, and the client holds it.
 *
 * The actions that change what rows exist do revalidate, because that is
 * the one thing the client cannot work out for itself.
 */

const PATH = '/dashboard/planner';

/** Trim, cap, and never store a control character somebody pasted. */
function text(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

function intOrNull(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(Math.round(parsed), max);
}

/**
 * A URL we are willing to store and later render as a link.
 *
 * http and https only. A `javascript:` or `data:` URL pasted into the live
 * link column becomes an anchor somebody clicks, and the planner is a place
 * where one agency's row is rendered in one agency's browser - which is
 * only reassuring until somebody shares an export.
 */
function safeUrl(value: unknown): string | null {
  const raw = text(value, 2048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- projects

export async function saveProjectAction(input: {
  id?: string;
  name: string;
  domain: string;
  country: string;
  currency: string;
  monthlyBudgetMinor: number | null;
  monthlyLinkTarget: number | null;
  notes: string;
}) {
  const user = await requireCustomerSession(PATH);

  const domain = domainKey(input.domain);
  if (!looksLikeDomain(domain)) {
    return { error: 'Enter the website this project is for, for example example.com.' };
  }
  const name = text(input.name, 80) || domain;

  const project = await plannerService.saveProject(user.id, {
    id: input.id,
    name,
    domain,
    country: text(input.country, 2).toLowerCase() || 'gb',
    currency: text(input.currency, 3).toUpperCase() || 'GBP',
    monthlyBudgetMinor: intOrNull(input.monthlyBudgetMinor, 2_000_000_000),
    monthlyLinkTarget: intOrNull(input.monthlyLinkTarget, 10_000),
    notes: text(input.notes, 2000),
  });

  revalidatePath(PATH);
  return { project };
}

export async function archiveProjectAction(projectId: string) {
  const user = await requireCustomerSession(PATH);
  await plannerService.archiveProject(user.id, String(projectId));
  revalidatePath(PATH);
  return { archived: true };
}

// --------------------------------------------------------------- months

export async function saveMonthAction(
  projectId: string,
  month: string,
  patch: { budgetMinor: number | null; linkTarget: number | null },
) {
  const user = await requireCustomerSession(PATH);
  await plannerService.saveMonth(user.id, String(projectId), monthStart(month), {
    budgetMinor: intOrNull(patch.budgetMinor, 2_000_000_000),
    linkTarget: intOrNull(patch.linkTarget, 10_000),
  });
  revalidatePath(PATH);
  return { saved: true };
}

// ---------------------------------------------------------------- links

export async function addLinkAction(projectId: string, month: string, statusId: string, domain: string) {
  const user = await requireCustomerSession(PATH);

  const typed = text(domain, 253);
  const key = domainKey(typed);
  if (!looksLikeDomain(key)) {
    return { error: 'Enter a domain, for example forbes.com.' };
  }

  const link = await plannerService.addLink(user.id, String(projectId), monthStart(month), String(statusId), {
    domain: typed,
    domainKey: key,
  });

  revalidatePath(PATH);
  return { link };
}

/**
 * One field, or a few, of one row.
 *
 * The patch is rebuilt field by field rather than passed through, so a
 * property the browser invents - `user_id`, say - never reaches the
 * service. The service's own `toRow` names its columns for the same
 * reason; this is the outer of the two allowlists.
 */
export async function updateLinkAction(linkId: string, patch: PlannerLinkPatch) {
  const user = await requireCustomerSession(PATH);

  const clean: PlannerLinkPatch = {};
  if (patch.domain !== undefined) {
    clean.domain = text(patch.domain, 253);
    clean.domainKey = domainKey(clean.domain);
  }
  if (patch.source !== undefined) clean.source = text(patch.source, 60);
  if (patch.linkType !== undefined) clean.linkType = text(patch.linkType, 40);
  if (patch.anchorText !== undefined) clean.anchorText = text(patch.anchorText, 200);
  if (patch.anchorType !== undefined) clean.anchorType = text(patch.anchorType, 40);
  if (patch.notes !== undefined) clean.notes = text(patch.notes, 2000);
  if (patch.statusId !== undefined) clean.statusId = String(patch.statusId);
  if (patch.projectId !== undefined) clean.projectId = String(patch.projectId);
  if (patch.planMonth !== undefined) clean.planMonth = monthStart(patch.planMonth);

  if (patch.targetUrl !== undefined) clean.targetUrl = safeUrl(patch.targetUrl);
  if (patch.liveUrl !== undefined) clean.liveUrl = safeUrl(patch.liveUrl);

  if (patch.domainRating !== undefined) clean.domainRating = intOrNull(patch.domainRating, 100);
  if (patch.organicTraffic !== undefined) {
    clean.organicTraffic = intOrNull(patch.organicTraffic, 2_000_000_000);
  }
  if (patch.organicKeywords !== undefined) {
    clean.organicKeywords = intOrNull(patch.organicKeywords, 2_000_000_000);
  }
  if (patch.referringDomains !== undefined) {
    clean.referringDomains = intOrNull(patch.referringDomains, 2_000_000_000);
  }
  if (patch.metricsSource !== undefined) {
    clean.metricsSource =
      patch.metricsSource === null ||
      ['manual', 'csv', 'press-parrot'].includes(String(patch.metricsSource))
        ? patch.metricsSource
        : 'manual';
  }
  if (patch.metricsUpdatedAt !== undefined) clean.metricsUpdatedAt = patch.metricsUpdatedAt;

  if (patch.priceMinor !== undefined) clean.priceMinor = intOrNull(patch.priceMinor, 2_000_000_000);
  if (patch.paidMinor !== undefined) clean.paidMinor = intOrNull(patch.paidMinor, 2_000_000_000);
  if (patch.currency !== undefined) {
    clean.currency = patch.currency ? text(patch.currency, 3).toUpperCase() : null;
  }
  if (patch.paymentStatus !== undefined) {
    clean.paymentStatus = ['unpaid', 'partially_paid', 'paid'].includes(String(patch.paymentStatus))
      ? patch.paymentStatus
      : 'unpaid';
  }

  /* A date, or nothing. An unparseable string would otherwise reach a
     `date` column and fail the whole save with a Postgres error nobody can
     act on. */
  const asDate = (value: unknown): string | null => {
    const raw = text(value, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  };
  if (patch.plannedDate !== undefined) clean.plannedDate = asDate(patch.plannedDate);
  if (patch.liveDate !== undefined) clean.liveDate = asDate(patch.liveDate);

  try {
    const link = await plannerService.updateLink(user.id, String(linkId), clean);
    // No revalidate. See the note at the top of this file.
    return { link };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'That did not save.' };
  }
}

export async function deleteLinksAction(linkIds: string[]) {
  const user = await requireCustomerSession(PATH);
  const ids = (Array.isArray(linkIds) ? linkIds : []).map(String).slice(0, 500);
  const removed = await plannerService.deleteLinks(user.id, ids);
  revalidatePath(PATH);
  return { removed };
}

// ------------------------------------------------------------- statuses

export async function saveStatusAction(input: {
  id?: string;
  name: string;
  colour: string;
  category: string;
  sortOrder: number;
}) {
  const user = await requireCustomerSession(PATH);

  const name = text(input.name, 40);
  if (!name) return { error: 'Give the status a name.' };

  const colour = /^#[0-9a-fA-F]{6}$/.test(String(input.colour)) ? String(input.colour) : '#64748b';
  const category = (
    STATUS_CATEGORIES.includes(input.category as StatusCategory) ? input.category : 'planned'
  ) as StatusCategory;

  try {
    const status = await plannerService.saveStatus(user.id, {
      id: input.id,
      name,
      colour,
      category,
      sortOrder: intOrNull(input.sortOrder, 10_000) ?? 0,
    });
    revalidatePath(PATH);
    return { status };
  } catch {
    // The table is unique on (user_id, name), which is the only way this
    // realistically fails and the only one worth a sentence.
    return { error: 'You already have a status with that name.' };
  }
}

export async function retireStatusAction(statusId: string) {
  const user = await requireCustomerSession(PATH);
  const result = await plannerService.retireStatus(user.id, String(statusId));
  revalidatePath(PATH);
  return result;
}

// -------------------------------------------------------------- sources

export async function addSourceAction(name: string) {
  const user = await requireCustomerSession(PATH);
  const clean = text(name, 60);
  if (!clean) return { error: 'Give the source a name.' };
  await plannerService.addSource(user.id, clean);
  revalidatePath(PATH);
  return { added: clean };
}
