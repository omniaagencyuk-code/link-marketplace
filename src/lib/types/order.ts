import type { LinkTypeSlug } from './website';

export type OrderStatus =
  | 'draft'
  | 'awaiting-content'
  | 'in-progress'
  | 'submitted'
  | 'live'
  | 'cancelled';

export interface OrderItem {
  id: string;
  orderId: string;
  websiteId: string;
  websiteDomain: string;
  websiteSlug: string;
  serviceType: LinkTypeSlug;
  priceMinor: number;
  targetUrl: string;
  anchorText: string;
  preferredLandingPage?: string;
  notes?: string;
  /** Optional article supplied by the buyer. */
  articleFileName?: string;
  articleFileSize?: number;
  /** Populated once the placement goes live. */
  liveUrl?: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  /** Human readable reference, e.g. "LM-10428". */
  reference: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  totalMinor: number;
  currency: 'GBP' | 'USD' | 'EUR';
  items: OrderItem[];
  placedAt: string;
  updatedAt: string;
  /** Expected go-live date, ISO string. */
  expectedLiveAt?: string;
}

/**
 * An item in the client-side order builder before checkout.
 *
 * Websites are added straight from the marketplace with the placement details
 * blank; the buyer fills those in on the order page.
 */
export interface DraftOrderItem {
  id: string;
  websiteId: string;
  websiteSlug: string;
  websiteDomain: string;
  serviceType: LinkTypeSlug;
  priceMinor: number;
  targetUrl: string;
  anchorText: string;
  preferredLandingPage?: string;
  notes?: string;
  /**
   * Optional article supplied by the buyer. Only the file's name and size are
   * kept locally; the upload itself happens when storage is connected.
   */
  articleFileName?: string;
  articleFileSize?: number;
  addedAt: string;
}
