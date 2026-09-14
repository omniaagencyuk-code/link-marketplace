'use server';

import { revalidatePath } from 'next/cache';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { contentService, settingsService } from '@/lib/services';
import { priceForWords } from '@/lib/services/content-pricing';
import { sanitiseText } from '@/lib/import/normalise';
import { contentTypes, contentTones, contentLanguages } from '@/lib/config/content';
import type { ContentBrief, ContentTypeSlug } from '@/lib/types/content';

/**
 * Content ordering server actions.
 *
 * Every action re-checks the session: server actions have their own endpoints
 * and are reachable without rendering a page, so `proxy.ts` is not enough.
 * Briefs arrive from the browser, so they are sanitised and re-validated here,
 * and prices are recomputed server-side rather than trusted from the client.
 */

const contentTypeSlugs = new Set(contentTypes.map((type) => type.slug));
const toneSlugs = new Set(contentTones.map((tone) => tone.slug));
const languageCodes = new Set(contentLanguages.map((language) => language.code));

const MAX_ARTICLES_PER_ORDER = 50;

/** Re-derive a trustworthy brief from whatever the client sent. */
function cleanBrief(input: unknown): ContentBrief | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;

  const text = (value: unknown, max = 600) =>
    typeof value === 'string' ? sanitiseText(value, max) : '';
  const list = (value: unknown, max = 20) =>
    Array.isArray(value)
      ? value
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => sanitiseText(entry, 200))
          .filter(Boolean)
          .slice(0, max)
      : [];

  const brandName = text(raw.brand, 120);
  const topic = text(raw.topic, 300);
  const targetKeyword = text(raw.targetKeyword, 160);
  if (!brandName || !topic || !targetKeyword) return null;

  const wordCount = Number(raw.wordCount);
  if (!Number.isFinite(wordCount) || wordCount < 100 || wordCount > 20_000) return null;

  const contentType = String(raw.contentType) as ContentTypeSlug;
  if (!contentTypeSlugs.has(contentType)) return null;

  const tone = String(raw.tone);
  const language = String(raw.language);

  const brief: ContentBrief = {
    brand: brandName,
    topic,
    suggestedTitle: text(raw.suggestedTitle, 200) || undefined,
    targetKeyword,
    secondaryKeywords: list(raw.secondaryKeywords),
    targetUrl: text(raw.targetUrl, 500) || undefined,
    anchorText: text(raw.anchorText, 160) || undefined,
    wordCount: Math.round(wordCount),
    contentType,
    country: text(raw.country, 4) || undefined,
    language: (languageCodes.has(language as never) ? language : 'en-GB') as ContentBrief['language'],
    tone: (toneSlugs.has(tone as never) ? tone : 'professional') as ContentBrief['tone'],
    audience: text(raw.audience, 300) || undefined,
    references: list(raw.references),
    instructions: text(raw.instructions, 2000) || undefined,
  };

  const fileName = text(raw.briefFileName, 200);
  if (fileName) {
    brief.briefFileName = fileName;
    const size = Number(raw.briefFileSize);
    if (Number.isFinite(size) && size > 0) brief.briefFileSize = Math.round(size);
  }

  return brief;
}

export interface SubmitContentOrderResult {
  ok: boolean;
  reference?: string;
  error?: string;
}

export async function submitContentOrderAction(
  payload: { brief: unknown; quantity: unknown }[],
): Promise<SubmitContentOrderResult> {
  const user = await requireCustomerSession('/dashboard/content/new');

  if (!Array.isArray(payload) || payload.length === 0) {
    return { ok: false, error: 'Your content order is empty.' };
  }

  const settings = await settingsService.get();
  const articles: { brief: ContentBrief; priceMinor: number }[] = [];

  for (const entry of payload) {
    const brief = cleanBrief(entry?.brief);
    if (!brief) return { ok: false, error: 'One of the briefs is incomplete. Check and try again.' };

    const quantity = Math.max(1, Math.min(50, Math.round(Number(entry?.quantity) || 1)));
    // Priced here, never from the client. An unpriced article is recorded at
    // zero and quoted manually rather than blocking the order.
    const priceMinor =
      priceForWords(settings.contentPricing, brief.wordCount, brief.contentType) ?? 0;

    for (let copy = 0; copy < quantity; copy += 1) {
      articles.push({ brief, priceMinor });
      if (articles.length > MAX_ARTICLES_PER_ORDER) {
        return {
          ok: false,
          error: `A single order can hold up to ${MAX_ARTICLES_PER_ORDER} articles. Split the rest into a second order.`,
        };
      }
    }
  }

  const order = await contentService.create({
    userId: user.id,
    customerName: user.fullName,
    customerEmail: user.email,
    currency: settings.currency,
    articles,
  });

  revalidatePath('/dashboard/content');
  revalidatePath('/dashboard');
  revalidatePath('/admin/content-orders');

  return { ok: true, reference: order.reference };
}

export async function requestRevisionAction(itemId: string, notes: string) {
  const user = await requireCustomerSession('/dashboard/content');
  const cleaned = sanitiseText(notes, 2000);
  if (!cleaned) return { ok: false, error: 'Describe what needs changing.' };

  const updated = await contentService.requestRevision(itemId, user.id, cleaned);
  if (!updated) return { ok: false, error: 'That article could not be found.' };

  await contentService.addMessage(itemId, {
    authorRole: 'customer',
    authorName: user.fullName,
    body: cleaned,
  });

  revalidatePath(`/dashboard/content/${itemId}`);
  revalidatePath('/dashboard/content');
  revalidatePath('/admin/content-orders');
  return { ok: true };
}

export async function sendContentMessageAction(itemId: string, body: string) {
  const user = await requireCustomerSession('/dashboard/content');
  const cleaned = sanitiseText(body, 2000);
  if (!cleaned) return { ok: false, error: 'Write a message first.' };

  // Scope the lookup to this customer so a guessed id cannot post into
  // someone else's thread.
  const row = await contentService.getItem(itemId, user.id);
  if (!row) return { ok: false, error: 'That article could not be found.' };

  await contentService.addMessage(itemId, {
    authorRole: 'customer',
    authorName: user.fullName,
    body: cleaned,
  });

  revalidatePath(`/dashboard/content/${itemId}`);
  return { ok: true };
}
