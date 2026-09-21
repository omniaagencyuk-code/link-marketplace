'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { orderService, settingsService, websiteService } from '@/lib/services';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { slugifyDomain } from '@/lib/utils/format';
import {
  isAcceptedNicheSlug,
  legacyAcceptanceFlags,
} from '@/lib/config/accepted-niches';
import type {
  LinkTypeSlug,
  NicheSlug,
  OrderStatus,
  Service,
  Website,
  WebsiteStatus,
} from '@/lib/types';

/**
 * Admin mutations.
 *
 * These run on the server and currently write to the in-memory mock store.
 * Replacing the service implementation with Supabase requires no changes here.
 */

function readNumber(formData: FormData, key: string, fallback = 0) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? value : fallback;
}

function readString(formData: FormData, key: string, fallback = '') {
  const value = formData.get(key);
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/**
 * The services a website offers.
 *
 * Driven by the type checkboxes rather than inferred from a price. The old
 * rule - "a price above zero means the service exists" - made a free or
 * not-yet-priced placement impossible to express, and made removing a service
 * a matter of guessing that zero meant delete.
 */
function buildServices(formData: FormData, websiteId: string, existing: Service[]): Service[] {
  const min = readNumber(formData, 'turnaroundMin', 3);
  const max = readNumber(formData, 'turnaroundMax', 5);
  const types: LinkTypeSlug[] = ['guest-post', 'niche-edit', 'digital-pr'];

  return types
    .filter((type) => formData.get(`service_${type}`) === 'on')
    .map((type): Service => {
      const previous = existing.find((service) => service.type === type);
      const cost = formData.get(`cost_${type}`);
      const costEntered = typeof cost === 'string' && cost.trim() !== '';
      const costValue = Number(cost);

      return {
        id: previous?.id ?? `${websiteId}_svc_${type}`,
        websiteId,
        type,
        priceMinor: Math.max(0, Math.round(readNumber(formData, `price_${type}`) * 100)),
        // Digital PR goes through a newsroom, so it runs longer than the
        // window entered for the other two.
        turnaroundMinDays: type === 'digital-pr' ? min + 4 : min,
        turnaroundMaxDays: type === 'digital-pr' ? max + 4 : max,
        available: true,
        note: readString(formData, `note_${type}`) || previous?.note,
        // An empty box means "not recorded", which is deliberately different
        // from a cost of zero and must not be stored as one.
        costPriceMinor:
          costEntered && Number.isFinite(costValue) && costValue >= 0
            ? Math.round(costValue * 100)
            : undefined,
      };
    });
}

function buildPatch(formData: FormData, websiteId: string, existing?: Website): Partial<Website> {
  const domain = readString(formData, 'domain');

  // Checkboxes all share one name, so every ticked box arrives as a separate
  // entry. Validated against the shared list, so a crafted request cannot
  // store a niche the site does not know about.
  const acceptedNiches = formData
    .getAll('acceptedNiches')
    .map((value) => String(value))
    .filter((value) => isAcceptedNicheSlug(value));

  const secondaryNiches = String(formData.get('secondaryNiches') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean) as NicheSlug[];

  return {
    domain,
    slug: slugifyDomain(domain),
    title: readString(formData, 'title', domain),
    description: readString(formData, 'description'),
    overview: readString(formData, 'overview', existing?.overview ?? ''),
    niche: readString(formData, 'niche', 'technology') as NicheSlug,
    secondaryNiches,
    country: readString(formData, 'country', 'GB') as Website['country'],
    language: readString(formData, 'language', 'en') as Website['language'],
    status: readString(formData, 'status', 'draft') as WebsiteStatus,
    verified: formData.get('verified') === 'on',
    metrics: {
      ...(existing?.metrics ?? {
        trafficTrend: [],
        trafficChangePct: 0,
        topCountryShare: 70,
        audienceSplit: [],
        spamScore: 2,
      }),
      domainRating: readNumber(formData, 'domainRating'),
      organicTraffic: readNumber(formData, 'organicTraffic'),
      referringDomains: readNumber(formData, 'referringDomains'),
    } as Website['metrics'],
    services: buildServices(formData, websiteId, existing?.services ?? []),
    rules: {
      ...(existing?.rules ?? {
        acceptsGambling: false,
        acceptsFinance: false,
        acceptsCrypto: false,
        acceptsCbd: false,
        acceptsAdult: false,
        contentProvidedBy: 'either',
        guidelines: [],
        examplePlacements: [],
      }),
      // The word count fields are only rendered when a service that involves
      // writing is selected, so an absent value keeps whatever was there
      // rather than resetting the publisher's stated minimum to a default.
      minWordCount: readNumber(formData, 'minWordCount', existing?.rules.minWordCount ?? 800),
      maxWordCount:
        readNumber(formData, 'minWordCount', existing?.rules.minWordCount ?? 800) + 1200,
      maxLinks: readNumber(formData, 'maxLinks', 1),
      linkAttribute: formData.get('dofollow') === 'on' ? 'dofollow' : 'nofollow',
      acceptedNiches,
      ...legacyAcceptanceFlags(acceptedNiches),
      sponsoredTag: readString(formData, 'sponsoredTag', 'never') as Website['rules']['sponsoredTag'],
      restrictedNiches: String(formData.get('restrictedNiches') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    } as Website['rules'],
  };
}

export async function saveWebsiteAction(formData: FormData) {
  await requireAdminSession();

  const id = readString(formData, 'id');
  let saved: Website | null = null;

  if (id) {
    const existing = await websiteService.getById(id);
    saved = await websiteService.update(id, buildPatch(formData, id, existing ?? undefined));
    // A renamed domain changes the slug, so refresh the old URL too.
    if (existing && existing.slug !== saved?.slug) revalidateMarketplace(existing.slug);
  } else {
    const domain = readString(formData, 'domain');
    const created = await websiteService.create({ domain });
    saved = await websiteService.update(created.id, buildPatch(formData, created.id, created));
  }

  revalidateMarketplace(saved?.slug);
  redirect('/admin/websites');
}

/**
 * Refresh every surface that renders website data.
 *
 * The homepage and the marketplace gateway show aggregate counts and a
 * redacted preview built from the same records, so they are refreshed too.
 */
function revalidateMarketplace(slug?: string) {
  revalidatePath('/admin/websites');
  revalidatePath('/marketplace');
  revalidatePath('/');
  revalidatePath('/sitemap.xml');
  if (slug) revalidatePath(`/websites/${slug}`);
}

export async function setWebsiteStatusAction(id: string, status: WebsiteStatus) {
  await requireAdminSession();

  const updated = await websiteService.setStatus(id, status);
  revalidateMarketplace(updated?.slug);
}

/**
 * Bulk operations on the websites list.
 *
 * Each row is applied independently and the outcome is reported per row. A
 * batch where one listing cannot be touched should not lose the other
 * nineteen, and "four published, one skipped because it has orders" is a far
 * more useful answer than a single failure.
 *
 * Bounded, because the ids arrive from the browser: a request claiming fifty
 * thousand of them is not a bulk edit.
 */
const MAX_BULK_IDS = 500;

export interface BulkResult {
  changed: number;
  /** Rows that were not changed, with the reason, for showing to the admin. */
  skipped: { domain: string; reason: string }[];
  error?: string;
}

function readIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, MAX_BULK_IDS);
}

export async function bulkSetWebsiteStatusAction(
  ids: unknown,
  status: WebsiteStatus,
): Promise<BulkResult> {
  await requireAdminSession();

  const allowed: WebsiteStatus[] = ['draft', 'active', 'paused', 'archived'];
  if (!allowed.includes(status)) return { changed: 0, skipped: [], error: 'Unknown status.' };

  const wanted = readIds(ids);
  if (wanted.length === 0) return { changed: 0, skipped: [], error: 'Nothing selected.' };

  const skipped: BulkResult['skipped'] = [];
  let changed = 0;

  for (const id of wanted) {
    try {
      const updated = await websiteService.setStatus(id, status);
      if (updated) changed += 1;
      else skipped.push({ domain: id, reason: 'No longer exists.' });
    } catch (error) {
      skipped.push({
        domain: id,
        reason: error instanceof Error ? error.message : 'Could not be updated.',
      });
    }
  }

  revalidateMarketplace();
  return { changed, skipped };
}

export async function bulkDeleteWebsitesAction(ids: unknown): Promise<BulkResult> {
  await requireAdminSession();

  const wanted = readIds(ids);
  if (wanted.length === 0) return { changed: 0, skipped: [], error: 'Nothing selected.' };

  const skipped: BulkResult['skipped'] = [];
  let changed = 0;

  for (const id of wanted) {
    // Read first, so a refusal can name the domain rather than an opaque id.
    const website = await websiteService.getById(id);
    const label = website?.domain ?? id;

    const result = await websiteService.delete(id);
    if (result.ok) changed += 1;
    else skipped.push({ domain: label, reason: result.reason ?? 'Could not be deleted.' });
  }

  revalidateMarketplace();
  return { changed, skipped };
}

export async function duplicateWebsiteAction(id: string) {
  await requireAdminSession();

  await websiteService.duplicate(id);
  revalidatePath('/admin/websites');
}

export async function setOrderStatusAction(id: string, status: OrderStatus) {
  await requireAdminSession();

  await orderService.updateStatus(id, status);
  revalidatePath('/admin/orders');
  revalidatePath('/dashboard/orders');
}

export async function saveSettingsAction(formData: FormData) {
  await requireAdminSession();

  await settingsService.update({
    brandName: readString(formData, 'brandName'),
    supportEmail: readString(formData, 'supportEmail'),
    salesEmail: readString(formData, 'salesEmail'),
    primaryColour: readString(formData, 'primaryColour'),
    accentColour: readString(formData, 'accentColour'),
    currency: readString(formData, 'currency', 'GBP') as 'GBP' | 'USD' | 'EUR',
    defaultPageSize: readNumber(formData, 'defaultPageSize', 25),
    defaultSort: readString(formData, 'defaultSort', 'relevance'),
    marginPct: readNumber(formData, 'marginPct', 20),
  });
  revalidatePath('/admin/settings');
}

/**
 * Content writing prices.
 *
 * Kept separate from the general settings form so saving brand details cannot
 * accidentally wipe pricing. Zero is a valid stored value and means "not
 * priced yet" - the public page shows "on request" rather than "free".
 */
export async function saveContentPricingAction(formData: FormData) {
  await requireAdminSession();

  const current = await settingsService.get();
  const mode = readString(formData, 'pricingMode', 'tiered') === 'per-word' ? 'per-word' : 'tiered';

  const tiers = current.contentPricing.tiers.map((tier) => {
    const value = Number(formData.get(`tier_${tier.words}`));
    return {
      words: tier.words,
      priceMinor: Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0,
    };
  });

  const perWord = Number(formData.get('perWord'));

  await settingsService.update({
    contentPricing: {
      ...current.contentPricing,
      mode,
      // Entered in whole currency units per 1,000 words, which is how writing
      // is quoted in practice; stored as minor units per word.
      perWordMinor: Number.isFinite(perWord) && perWord > 0 ? (perWord * 100) / 1000 : 0,
      tiers,
    },
  });

  revalidatePath('/admin/settings');
  revalidatePath('/content-writing');
  revalidatePath('/dashboard/content/new');
}
