'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { orderService, settingsService, websiteService } from '@/lib/services';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { slugifyDomain } from '@/lib/utils/format';
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

function buildServices(formData: FormData, websiteId: string, existing: Service[]): Service[] {
  const definitions: { type: LinkTypeSlug; priceKey: string }[] = [
    { type: 'guest-post', priceKey: 'guestPostPrice' },
    { type: 'niche-edit', priceKey: 'nicheEditPrice' },
    { type: 'digital-pr', priceKey: 'digitalPrPrice' },
  ];
  const min = readNumber(formData, 'turnaroundMin', 3);
  const max = readNumber(formData, 'turnaroundMax', 5);

  return definitions
    .map((definition): Service | null => {
      const price = readNumber(formData, definition.priceKey);
      if (price <= 0) return null;
      const previous = existing.find((service) => service.type === definition.type);
      return {
        id: previous?.id ?? `${websiteId}_svc_${definition.type}`,
        websiteId,
        type: definition.type,
        priceMinor: Math.round(price * 100),
        turnaroundMinDays: definition.type === 'digital-pr' ? min + 4 : min,
        turnaroundMaxDays: definition.type === 'digital-pr' ? max + 4 : max,
        available: true,
        note: previous?.note,
      };
    })
    .filter((service): service is Service => service !== null);
}

function buildPatch(formData: FormData, websiteId: string, existing?: Website): Partial<Website> {
  const domain = readString(formData, 'domain');
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
      minWordCount: readNumber(formData, 'minWordCount', 800),
      maxWordCount: readNumber(formData, 'minWordCount', 800) + 1200,
      maxLinks: readNumber(formData, 'maxLinks', 1),
      linkAttribute: formData.get('dofollow') === 'on' ? 'dofollow' : 'nofollow',
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
 * Marketplace listings are statically generated, so every surface that renders
 * website data has to be refreshed - including the individual listing page,
 * which is revalidated by its concrete path.
 */
function revalidateMarketplace(slug?: string) {
  revalidatePath('/admin/websites');
  revalidatePath('/websites');
  revalidatePath('/');
  revalidatePath('/sitemap.xml');
  if (slug) revalidatePath(`/websites/${slug}`);
}

export async function setWebsiteStatusAction(id: string, status: WebsiteStatus) {
  await requireAdminSession();

  const updated = await websiteService.setStatus(id, status);
  revalidateMarketplace(updated?.slug);
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
