import type { LinkTypeSlug } from './website';
import type { OrderStatus } from './order';
import type { ContentPricing } from './content';

/** Editable marketplace settings, surfaced in /admin/settings. */
export interface BrandSettings {
  id: string;
  brandName: string;
  supportEmail: string;
  salesEmail: string;
  primaryColour: string;
  accentColour: string;
  currency: 'GBP' | 'USD' | 'EUR';
  locale: string;
  /** Default number of marketplace results per page. */
  defaultPageSize: number;
  /** Default sort applied on /websites. */
  defaultSort: string;
  /** Link types enabled across the marketplace. */
  enabledLinkTypes: LinkTypeSlug[];
  /** Order statuses used by the fulfilment pipeline. */
  orderStatuses: { value: OrderStatus; label: string; description: string }[];
  /** Marketplace-wide markup applied to publisher prices, percentage. */
  marginPct: number;
  /** How content writing is priced. Ships empty until real prices are set. */
  contentPricing: ContentPricing;
  updatedAt: string;
}
