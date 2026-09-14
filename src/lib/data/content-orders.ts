import { users } from './users';
import type { ContentBrief, ContentOrder, ContentOrderItem } from '@/lib/types/content';

/**
 * Seed content orders.
 *
 * Enough history for the dashboard, the admin queue and the status filters to
 * be exercised. Every customer here is one of the existing account fixtures,
 * and every brand referenced is the fixture company's own - no real third
 * party is presented as a customer.
 */

function brief(partial: Partial<ContentBrief> & Pick<ContentBrief, 'brand' | 'topic' | 'targetKeyword'>): ContentBrief {
  return {
    secondaryKeywords: [],
    wordCount: 1000,
    contentType: 'seo-article',
    language: 'en-GB',
    tone: 'professional',
    references: [],
    ...partial,
  };
}

function item(
  id: string,
  orderId: string,
  reference: string,
  value: ContentBrief,
  status: ContentOrderItem['status'],
  priceMinor: number,
  createdAt: string,
  extras: Partial<ContentOrderItem> = {},
): ContentOrderItem {
  return {
    id,
    orderId,
    reference,
    brief: value,
    status,
    priceMinor,
    revisions: [],
    messages: [],
    deliveries: [],
    createdAt,
    updatedAt: createdAt,
    ...extras,
  };
}

const [hannah, , marta, tom] = users;

export const contentOrders: ContentOrder[] = [
  {
    id: 'cord_001',
    reference: 'PPC-1039',
    userId: hannah!.id,
    customerName: hannah!.fullName,
    customerEmail: hannah!.email,
    status: 'ready-for-review',
    totalMinor: 0,
    currency: 'GBP',
    placedAt: '2026-09-02T09:14:00.000Z',
    updatedAt: '2026-09-09T15:40:00.000Z',
    items: [
      item(
        'citem_001',
        'cord_001',
        'PPC-1039-01',
        brief({
          brand: 'Northbound Media',
          topic: 'How mid-market brands should budget for link building across a financial year',
          suggestedTitle: 'How to Budget for Link Building (Without Guessing)',
          targetKeyword: 'link building budget',
          secondaryKeywords: ['link building cost', 'seo budget planning'],
          targetUrl: 'https://northboundmedia.co.uk/services/link-building',
          anchorText: 'link building services',
          wordCount: 1500,
          audience: 'In-house marketing managers at mid-market B2B brands',
          instructions:
            'Practical and specific. Include a worked example of a quarterly budget split across guest posts and digital PR.',
        }),
        'ready-for-review',
        0,
        '2026-09-02T09:14:00.000Z',
        {
          writerName: 'Internal writing team',
          deliveries: [
            {
              id: 'del_001',
              kind: 'draft',
              fileName: 'link-building-budget-draft-1.docx',
              deliveredAt: '2026-09-09T15:40:00.000Z',
            },
          ],
          messages: [
            {
              id: 'msg_001',
              authorRole: 'team',
              authorName: 'Press Parrot',
              body: 'First draft attached. The quarterly worked example is in the second half - let us know if you would like the numbers adjusted.',
              createdAt: '2026-09-09T15:41:00.000Z',
            },
          ],
        },
      ),
      item(
        'citem_002',
        'cord_001',
        'PPC-1039-02',
        brief({
          brand: 'Northbound Media',
          topic: 'Anchor text distribution for commercial pages',
          targetKeyword: 'anchor text strategy',
          secondaryKeywords: ['anchor text ratio', 'exact match anchor'],
          wordCount: 1000,
          contentType: 'blog-post',
          tone: 'conversational',
        }),
        'writing',
        0,
        '2026-09-02T09:14:00.000Z',
        { writerName: 'Internal writing team' },
      ),
    ],
  },
  {
    id: 'cord_002',
    reference: 'PPC-1036',
    userId: marta!.id,
    customerName: marta!.fullName,
    customerEmail: marta!.email,
    status: 'complete',
    totalMinor: 0,
    currency: 'GBP',
    placedAt: '2026-08-11T11:02:00.000Z',
    updatedAt: '2026-08-22T10:15:00.000Z',
    items: [
      item(
        'citem_003',
        'cord_002',
        'PPC-1036-01',
        brief({
          brand: 'Velocity Search',
          topic: 'Guest post on programmatic SEO for travel marketplaces',
          targetKeyword: 'programmatic seo travel',
          wordCount: 1500,
          contentType: 'guest-post',
          tone: 'authoritative',
          audience: 'Growth leads at travel and booking platforms',
          references: ['https://velocitysearch.com/case-studies/travel'],
        }),
        'complete',
        0,
        '2026-08-11T11:02:00.000Z',
        {
          writerName: 'Internal writing team',
          revisions: [
            {
              id: 'rev_001',
              requestedAt: '2026-08-18T09:30:00.000Z',
              notes: 'Please tighten the introduction and lose the second case study.',
              resolvedAt: '2026-08-20T14:00:00.000Z',
            },
          ],
          deliveries: [
            {
              id: 'del_002',
              kind: 'draft',
              fileName: 'programmatic-seo-travel-draft-1.docx',
              deliveredAt: '2026-08-16T13:20:00.000Z',
            },
            {
              id: 'del_003',
              kind: 'final',
              fileName: 'programmatic-seo-travel-final.docx',
              deliveredAt: '2026-08-22T10:15:00.000Z',
            },
          ],
        },
      ),
    ],
  },
  {
    id: 'cord_003',
    reference: 'PPC-1041',
    userId: tom!.id,
    customerName: tom!.fullName,
    customerEmail: tom!.email,
    status: 'brief-received',
    totalMinor: 0,
    currency: 'GBP',
    placedAt: '2026-09-10T16:45:00.000Z',
    updatedAt: '2026-09-10T16:45:00.000Z',
    items: [
      item(
        'citem_004',
        'cord_003',
        'PPC-1041-01',
        brief({
          brand: 'Castel Digital',
          topic: 'Landing page copy for a local SEO retainer',
          targetKeyword: 'local seo services',
          secondaryKeywords: ['local seo agency', 'google business profile management'],
          targetUrl: 'https://casteldigital.co.uk/local-seo',
          wordCount: 750,
          contentType: 'landing-page',
          tone: 'persuasive',
          audience: 'Independent multi-location retailers',
          instructions: 'Three service tiers, clear pricing section, one testimonial slot left blank.',
        }),
        'brief-received',
        0,
        '2026-09-10T16:45:00.000Z',
      ),
    ],
  },
];
