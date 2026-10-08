'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { orderService, settingsService, websiteService } from '@/lib/services';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { pricingService } from '@/lib/services/pricing-service';
import {
  advancePublishRun,
  cancelPublishRun,
  publishableCount,
  startPublishRun,
} from '@/lib/services/website-publish-run';
import { deliveryService } from '@/lib/services/delivery-service';
import { slugifyDomain } from '@/lib/utils/format';
import {
  isAcceptedNicheSlug,
  legacyAcceptanceFlags,
} from '@/lib/config/accepted-niches';
import type {
  NichePrice,
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

/** The permanence select, where an empty option means nobody has said. */
function readPermanence(formData: FormData): Website['rules']['permanence'] {
  const value = String(formData.get('permanence') ?? '');
  return value === 'permanent' || value === 'fixed-term' ? value : undefined;
}

/** A positive whole number, or undefined when the box was left empty. */
function readOptionalCount(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

/**
 * Yes, no, or nobody said.
 *
 * Three states and not a checkbox, because an unticked box and a publisher who
 * never mentioned homepage placement are the same pixel and opposite claims.
 */
function readTriState(formData: FormData, key: string): boolean | undefined {
  const value = String(formData.get(key) ?? '');
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return undefined;
}

/**
 * The example articles, from three pairs of boxes.
 *
 * The published date is kept from whatever was already stored, because the
 * form does not ask for one and inventing today's date would date every
 * example to the last time somebody saved the listing.
 */
function readExamplePlacements(
  formData: FormData,
  existing?: Website,
): Website['rules']['examplePlacements'] {
  const held = existing?.rules.examplePlacements ?? [];

  return [0, 1, 2]
    .map((index) => {
      const title = String(formData.get(`exampleTitle${index}`) ?? '').trim();
      const path = String(formData.get(`examplePath${index}`) ?? '').trim();
      if (!title || !path) return null;

      return {
        title,
        path: path.replace(/^\/+/, ''),
        publishedAt: held[index]?.publishedAt ?? '',
      };
    })
    .filter((entry): entry is { title: string; path: string; publishedAt: string } => entry !== null);
}

/**
 * A number, or undefined when the box was left empty.
 *
 * The difference matters for metrics: an empty field means nobody measured
 * it, and storing that as 0 is how a listing came to publish "0% of the
 * audience is based in United Kingdom" as though it were a finding.
 */
function readOptionalNumber(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
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
  // One currency per publisher, stamped onto every cost it describes.
  const costCurrency = readString(formData, 'costCurrency').trim().toUpperCase();
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
        ...(costCurrency.length === 3 ? { costCurrency } : {}),
      };
    });
}

/**
 * Price overrides, read back from the grid.
 *
 * Only for niches the publisher accepts and placements the site sells: a
 * price for a niche that was just unticked is a price for something not on
 * sale, and keeping it would quietly reappear the next time the niche was
 * ticked. An empty box is absence, not zero - zero would publish the niche as
 * free.
 */
function buildNichePrices(
  formData: FormData,
  acceptedNiches: string[],
  services: Service[],
): NichePrice[] {
  const prices: NichePrice[] = [];

  for (const niche of acceptedNiches) {
    for (const service of services) {
      const raw = formData.get(`nichePrice_${niche}_${service.type}`);
      if (typeof raw !== 'string' || raw.trim() === '') continue;

      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) continue;

      prices.push({ niche, linkType: service.type, priceMinor: Math.round(value * 100) });
    }
  }

  return prices;
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

  // Built before the return so the niche prices can be keyed to what is
  // actually on sale.
  const services = buildServices(formData, websiteId, existing?.services ?? []);

  return {
    domain,
    slug: slugifyDomain(domain),
    title: readString(formData, 'title', domain),
    description: readString(formData, 'description'),
    overview: readString(formData, 'overview', existing?.overview ?? ''),
    niche: readString(formData, 'niche', 'technology') as NicheSlug,
    secondaryNiches,
    // Blank means not stated, and has to survive as not stated rather than
    // becoming a country the publisher never named. A country chosen here is
    // the strongest source there is: the nightly refresh leaves it alone.
    country: (readString(formData, 'country') || undefined) as Website['country'],
    countrySource: readString(formData, 'country') ? 'stated' : undefined,
    language: readString(formData, 'language', 'en') as Website['language'],
    status: readString(formData, 'status', 'draft') as WebsiteStatus,
    verified: formData.get('verified') === 'on',
    metrics: {
      ...(existing?.metrics ?? {
        trafficTrend: [],
        audienceSplit: [],
      }),
      domainRating: readNumber(formData, 'domainRating'),
      organicTraffic: readNumber(formData, 'organicTraffic'),
      referringDomains: readNumber(formData, 'referringDomains'),
      // Optional, so an empty box clears it rather than storing a zero that
      // would read as "this site ranks for nothing".
      organicKeywords: readOptionalNumber(formData, 'organicKeywords'),
      // These three are read straight from the form rather than falling back
      // to what was there, so clearing a field genuinely clears it.
      topCountryShare: readOptionalNumber(formData, 'topCountryShare'),
      trafficChangePct: readOptionalNumber(formData, 'trafficChangePct'),
      spamScore: readOptionalNumber(formData, 'spamScore'),
    } as Website['metrics'],
    services,
    nichePrices: buildNichePrices(formData, acceptedNiches, services),
    // Read straight from the form so an admin can correct a currency the
    // email extraction got wrong, or fill one it never stated. Blank stays
    // blank: "not recorded" is an answer, and pricing refuses to guess past
    // it rather than treating the publisher as British.
    costCurrency: readString(formData, 'costCurrency'),
    contact: {
      email: readString(formData, 'contactEmail'),
      name: readString(formData, 'contactName'),
      notes: readString(formData, 'contactNotes'),
    },
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

      /*
        The publisher's own terms.

        Each is written as a key whose value may be undefined, because the
        mapper distinguishes "the form did not mention this" from "the form
        cleared it" by whether the key is present. These are always on the
        form, so clearing one here really does clear it in the database rather
        than silently keeping a term the publisher has since withdrawn.
      */
      permanence: readPermanence(formData),
      minLiveMonths: readOptionalCount(formData, 'minLiveMonths'),
      dofollowExpiresAfterMonths: readOptionalCount(formData, 'dofollowExpiresAfterMonths'),
      homepagePlacement: readTriState(formData, 'homepagePlacement'),
      topicRestriction: readString(formData, 'topicRestriction') || undefined,
      // Only the rows that were filled in, and only ones carrying both halves:
      // a title with no path is a link to the homepage, which is not an
      // example of anything.
      examplePlacements: readExamplePlacements(formData, existing),
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

  // Publishing an unpriced listing is refused rather than thrown: the reason
  // is something the admin can act on, and a 500 would just look broken.
  let updated;
  try {
    updated = await websiteService.setStatus(id, status);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not change the status.' };
  }
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
  skipped: { domain: string; reason: string; id?: string }[];
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
    // Read first, so a refusal names the domain rather than an opaque id.
    // Fifty-seven uuids and a reason tells you nothing about which listing to
    // go and fix; the delete path already did this and this one did not.
    const existing = await websiteService.getById(id);
    const label = existing?.domain ?? id;

    try {
      const updated = await websiteService.setStatus(id, status);
      if (updated) changed += 1;
      else skipped.push({ id, domain: label, reason: 'No longer exists.' });
    } catch (error) {
      skipped.push({
        id,
        domain: label,
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
    else skipped.push({ id, domain: label, reason: result.reason ?? 'Could not be deleted.' });
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

/**
 * Hand a finished placement back to the customer.
 *
 * Recording the URL and telling the customer are one action on purpose. A
 * live URL saved quietly is one nobody is ever told about, which is exactly
 * how this column came to exist for a year with nothing writing to it.
 */
export async function deliverItemAction(itemId: string, orderId: string, liveUrl: string) {
  await requireAdminSession();

  const result = await deliveryService.deliver(itemId, liveUrl);
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/admin/orders');
  revalidatePath('/dashboard/orders');
  return result;
}

/** What we did about a complaint. Shown back to the customer in their words' place. */
export async function resolveIssueAction(issueId: string, orderId: string, note: string) {
  const session = await requireAdminSession();

  const result = await deliveryService.resolveIssue(issueId, note, session.email);
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/admin/orders');
  revalidatePath('/dashboard/orders');
  return result;
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

/* ------------------------------------------------------- publishing the backlog

  Selecting seven thousand rows in a table that shows twenty-five is not a
  thing to ask of anybody, and the browser cannot hold the tab open long
  enough anyway. One press starts a run; cron carries it on.
*/

export async function startPublishRunAction() {
  const session = await requireAdminSession();
  const outcome = await startPublishRun(session.email ?? 'an administrator');

  if (outcome.ok) {
    // Advanced once here so the first slice happens while somebody is
    // watching, rather than the screen saying "started" and nothing moving
    // until the next cron tick.
    await advancePublishRun(20_000).catch(() => undefined);
    revalidatePath('/admin/websites');
  }
  return outcome;
}

export async function advancePublishRunAction() {
  await requireAdminSession();
  const outcome = await advancePublishRun(20_000);
  revalidatePath('/admin/websites');
  return outcome;
}

export async function cancelPublishRunAction() {
  await requireAdminSession();
  const outcome = await cancelPublishRun();
  revalidatePath('/admin/websites');
  return outcome;
}

export async function publishableCountAction() {
  await requireAdminSession();
  return publishableCount();
}

/* ------------------------------------------------- the admin website table

  One page at a time. The table used to be handed every non-archived listing
  with costs, contacts and commercials joined on - 11,042 rows to render
  fifty, and about a minute to open.
*/

/**
 * How many rows one request may carry, whatever the page asks for.
 *
 * The largest size the table offers is 250, so this is that and not a round
 * number: a cap below the biggest option would silently hand back a short
 * page, which reads as a filter matching less than it does.
 */
const ADMIN_PAGE_MAX = 250;

export async function adminWebsitePageAction(input: {
  search: string;
  status: string;
  page: number;
  pageSize: number;
}) {
  await requireAdminSession();

  const page = Math.max(1, Math.floor(input.page) || 1);
  const pageSize = Math.min(ADMIN_PAGE_MAX, Math.max(1, Math.floor(input.pageSize) || 50));

  const { items, total } = await websiteService.adminPage(
    String(input.search ?? ''),
    String(input.status ?? 'all'),
    page,
    pageSize,
  );

  /*
    Costs for the fifty rows on screen, not for the inventory.

    The margin column needs the engine's converted cost including the rate
    card, and working that out for every listing was the other half of the
    minute. Asked for by id, it is one query for the page.
  */
  const trueCosts = await pricingService
    .trueCostsByWebsite(items.map((item) => item.id))
    .catch(() => ({}));

  return { items, total, trueCosts };
}

/**
 * Every listing id the filter matches.
 *
 * For the header checkbox, which has always selected a whole filter rather
 * than the page on screen. Paging the table must not quietly turn that into
 * "these fifty", so the ids are fetched when somebody ticks it.
 */
export async function adminWebsiteIdsAction(search: string, status: string) {
  await requireAdminSession();
  return websiteService.adminIds(String(search ?? ''), String(status ?? 'all'));
}

/**
 * The admin rows behind a selection.
 *
 * The header checkbox selects a whole filter, which can be more listings than
 * the page is showing, and Export and Copy domains need the rows rather than
 * the ids. Fetched when one of those is pressed rather than held in the
 * browser for the whole visit.
 *
 * Capped per request; the caller chunks. A cap that trimmed silently would be
 * an export missing rows with nothing saying so, so it refuses instead.
 */
export async function adminWebsitesByIdsAction(ids: string[]) {
  await requireAdminSession();

  const wanted = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
  if (wanted.length === 0) return { items: [], trueCosts: {} };
  if (wanted.length > ADMIN_PAGE_MAX) {
    throw new Error(`Asked for ${wanted.length} listings at once; the limit is ${ADMIN_PAGE_MAX}.`);
  }

  const items = await websiteService.adminRows(wanted);
  const trueCosts = await pricingService.trueCostsByWebsite(wanted).catch(() => ({}));
  return { items, trueCosts };
}
