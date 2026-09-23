import { websites } from './websites';
import { users } from './users';
import { placementPrice } from '@/lib/utils/pricing';
import type { LinkTypeSlug, Order, OrderItem, OrderStatus } from '@/lib/types';

interface RawOrderItem {
  websiteSlug: string;
  serviceType: LinkTypeSlug;
  /** The declared subject, where the publisher prices topics apart. */
  topic?: string;
  targetUrl: string;
  anchorText: string;
  status?: OrderStatus;
  liveUrl?: string;
  notes?: string;
}

interface RawOrder {
  reference: string;
  userId: string;
  status: OrderStatus;
  placedAt: string;
  expectedLiveAt?: string;
  items: RawOrderItem[];
}

const rawOrders: RawOrder[] = [
  {
    reference: 'LM-10482',
    userId: 'usr_001',
    status: 'live',
    placedAt: '2026-07-14T09:20:00.000Z',
    expectedLiveAt: '2026-07-18T00:00:00.000Z',
    items: [
      {
        websiteSlug: 'casinoguru-co-uk',
        serviceType: 'guest-post',
        topic: 'gambling',
        targetUrl: 'https://northboundmedia.co.uk/casino-bonus-guide',
        anchorText: 'casino bonus guide',
        status: 'live',
        liveUrl: 'https://casinoguru.co.uk/features/choosing-a-bonus-that-pays',
      },
      {
        websiteSlug: 'bettingedge-co-uk',
        serviceType: 'niche-edit',
        topic: 'gambling',
        targetUrl: 'https://northboundmedia.co.uk/odds-explained',
        anchorText: 'how betting odds work',
        status: 'live',
        liveUrl: 'https://bettingedge.co.uk/guides/value-betting-basics',
      },
    ],
  },
  {
    reference: 'LM-10517',
    userId: 'usr_001',
    status: 'in-progress',
    placedAt: '2026-08-21T14:05:00.000Z',
    expectedLiveAt: '2026-09-15T00:00:00.000Z',
    items: [
      {
        websiteSlug: 'ledgerloop-co-uk',
        serviceType: 'guest-post',
        targetUrl: 'https://northboundmedia.co.uk/isa-comparison',
        anchorText: 'compare stocks and shares ISAs',
        status: 'in-progress',
        notes: 'Please keep the tone neutral, no direct product promotion in the intro.',
      },
    ],
  },
  {
    reference: 'LM-10533',
    userId: 'usr_001',
    status: 'awaiting-content',
    placedAt: '2026-08-29T10:40:00.000Z',
    expectedLiveAt: '2026-09-19T00:00:00.000Z',
    items: [
      {
        websiteSlug: 'stackpilot-io',
        serviceType: 'guest-post',
        targetUrl: 'https://northboundmedia.co.uk/platform-engineering',
        anchorText: 'platform engineering playbook',
        status: 'awaiting-content',
      },
      {
        websiteSlug: 'cloudcanvas-io',
        serviceType: 'niche-edit',
        targetUrl: 'https://northboundmedia.co.uk/finops-checklist',
        anchorText: 'FinOps checklist',
        status: 'awaiting-content',
      },
    ],
  },
  {
    reference: 'LM-10545',
    userId: 'usr_001',
    status: 'submitted',
    placedAt: '2026-09-02T08:15:00.000Z',
    expectedLiveAt: '2026-09-12T00:00:00.000Z',
    items: [
      {
        websiteSlug: 'terracetalk-co-uk',
        serviceType: 'guest-post',
        targetUrl: 'https://northboundmedia.co.uk/matchday-analytics',
        anchorText: 'matchday analytics',
        status: 'submitted',
      },
    ],
  },
  {
    reference: 'LM-10551',
    userId: 'usr_001',
    status: 'draft',
    placedAt: '2026-09-08T16:30:00.000Z',
    items: [
      {
        websiteSlug: 'chainbeacon-io',
        serviceType: 'guest-post',
        targetUrl: 'https://northboundmedia.co.uk/custody-report',
        anchorText: 'digital asset custody report',
        status: 'draft',
      },
    ],
  },
  {
    reference: 'LM-10402',
    userId: 'usr_001',
    status: 'cancelled',
    placedAt: '2026-05-30T11:00:00.000Z',
    items: [
      {
        websiteSlug: 'primetimepost-com',
        serviceType: 'guest-post',
        targetUrl: 'https://northboundmedia.co.uk/streaming-trends',
        anchorText: 'streaming trends 2026',
        status: 'cancelled',
        notes: 'Publisher paused new placements, refunded in full.',
      },
    ],
  },
  {
    reference: 'LM-10496',
    userId: 'usr_003',
    status: 'live',
    placedAt: '2026-07-29T12:45:00.000Z',
    items: [
      {
        websiteSlug: 'capitalcadence-com',
        serviceType: 'digital-pr',
        targetUrl: 'https://velocitysearch.com/market-outlook',
        anchorText: 'market outlook study',
        status: 'live',
        liveUrl: 'https://capitalcadence.com/research/quarterly-outlook',
      },
    ],
  },
  {
    reference: 'LM-10502',
    userId: 'usr_004',
    status: 'in-progress',
    placedAt: '2026-08-04T09:10:00.000Z',
    items: [
      {
        websiteSlug: 'vitalityvault-co-uk',
        serviceType: 'guest-post',
        targetUrl: 'https://casteldigital.co.uk/sleep-study',
        anchorText: 'sleep quality study',
        status: 'in-progress',
      },
    ],
  },
  {
    reference: 'LM-10509',
    userId: 'usr_005',
    status: 'awaiting-content',
    placedAt: '2026-08-12T15:25:00.000Z',
    items: [
      {
        websiteSlug: 'wanderwrit-com',
        serviceType: 'guest-post',
        targetUrl: 'https://meridianbrands.com/travel-collection',
        anchorText: 'slow travel collection',
        status: 'awaiting-content',
      },
      {
        websiteSlug: 'slowmiles-co-uk',
        serviceType: 'niche-edit',
        targetUrl: 'https://meridianbrands.com/rail-guide',
        anchorText: 'UK rail guide',
        status: 'awaiting-content',
      },
    ],
  },
  {
    reference: 'LM-10520',
    userId: 'usr_006',
    status: 'submitted',
    placedAt: '2026-08-23T13:05:00.000Z',
    items: [
      {
        websiteSlug: 'prudentpath-ca',
        serviceType: 'guest-post',
        targetUrl: 'https://parallaxseo.ca/rrsp-calculator',
        anchorText: 'RRSP calculator',
        status: 'submitted',
      },
    ],
  },
  {
    reference: 'LM-10528',
    userId: 'usr_007',
    status: 'live',
    placedAt: '2026-08-26T10:55:00.000Z',
    items: [
      {
        websiteSlug: 'siliconslate-com',
        serviceType: 'digital-pr',
        targetUrl: 'https://altitudegrowth.com/ai-adoption-index',
        anchorText: 'AI adoption index',
        status: 'live',
        liveUrl: 'https://siliconslate.com/reports/ai-adoption-index-2026',
      },
      {
        websiteSlug: 'bytehorizon-com',
        serviceType: 'guest-post',
        targetUrl: 'https://altitudegrowth.com/ai-tools',
        anchorText: 'best AI tools for marketers',
        status: 'live',
        liveUrl: 'https://bytehorizon.com/ai/marketing-tool-stack',
      },
    ],
  },
  {
    reference: 'LM-10540',
    userId: 'usr_008',
    status: 'in-progress',
    placedAt: '2026-09-01T09:35:00.000Z',
    items: [
      {
        websiteSlug: 'torqueterrace-co-uk',
        serviceType: 'niche-edit',
        targetUrl: 'https://kestrelmarketing.co.uk/ev-leasing',
        anchorText: 'EV leasing deals',
        status: 'in-progress',
      },
    ],
  },
];

function buildOrders(): Order[] {
  return rawOrders.map((raw, orderIndex) => {
    const user = users.find((candidate) => candidate.id === raw.userId) ?? users[0]!;
    const id = `ord_${String(orderIndex + 1).padStart(3, '0')}`;

    const items: OrderItem[] = raw.items.map((rawItem, itemIndex) => {
      const website = websites.find((candidate) => candidate.slug === rawItem.websiteSlug);
      const service = website?.services.find((candidate) => candidate.type === rawItem.serviceType);
      // Priced through the same function checkout uses, so a seeded gambling
      // placement carries the gambling rate rather than a number typed here.
      const priced = website
        ? placementPrice(website, rawItem.serviceType, rawItem.topic)
        : null;
      return {
        id: `${id}_item_${itemIndex + 1}`,
        orderId: id,
        websiteId: website?.id ?? 'unknown',
        websiteDomain: website?.domain ?? rawItem.websiteSlug,
        websiteSlug: rawItem.websiteSlug,
        serviceType: rawItem.serviceType,
        topic: rawItem.topic,
        priceMinor: priced?.priceMinor ?? service?.priceMinor ?? 0,
        listPriceMinor: priced?.listPriceMinor ?? service?.priceMinor ?? 0,
        targetUrl: rawItem.targetUrl,
        anchorText: rawItem.anchorText,
        notes: rawItem.notes,
        liveUrl: rawItem.liveUrl,
        status: rawItem.status ?? raw.status,
        createdAt: raw.placedAt,
        updatedAt: raw.placedAt,
      } satisfies OrderItem;
    });

    return {
      id,
      reference: raw.reference,
      userId: raw.userId,
      customerName: user.fullName,
      customerEmail: user.email,
      status: raw.status,
      totalMinor: items.reduce((sum, item) => sum + item.priceMinor, 0),
      currency: 'GBP',
      items,
      placedAt: raw.placedAt,
      updatedAt: raw.placedAt,
      expectedLiveAt: raw.expectedLiveAt,
    } satisfies Order;
  });
}

export const orders: Order[] = buildOrders();
