import { brand } from '@/lib/config/brand';
import type { BrandSettings } from '@/lib/types';

export const defaultSettings: BrandSettings = {
  id: 'settings_default',
  brandName: brand.name,
  supportEmail: brand.supportEmail,
  salesEmail: brand.salesEmail,
  primaryColour: brand.colours.primary,
  accentColour: brand.colours.accent,
  currency: brand.currency,
  locale: brand.locale,
  defaultPageSize: 25,
  defaultSort: 'relevance',
  enabledLinkTypes: ['guest-post', 'niche-edit', 'digital-pr'],
  marginPct: 22,
  orderStatuses: [
    { value: 'draft', label: 'Draft', description: 'Saved but not yet submitted by the customer.' },
    {
      value: 'awaiting-content',
      label: 'Awaiting Content',
      description: 'Brief received, article being written or supplied.',
    },
    {
      value: 'in-progress',
      label: 'In Progress',
      description: 'Content approved and scheduled with the publisher.',
    },
    {
      value: 'submitted',
      label: 'Submitted',
      description: 'Sent to the publisher, awaiting publication.',
    },
    { value: 'live', label: 'Live', description: 'Placement is published and indexed.' },
    { value: 'cancelled', label: 'Cancelled', description: 'Refunded or withdrawn.' },
  ],
  updatedAt: '2026-09-01T00:00:00.000Z',
};
