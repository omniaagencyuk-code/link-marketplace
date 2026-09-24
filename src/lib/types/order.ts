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
  /**
   * The accepted-niche slug the buyer declared this placement is about.
   *
   * Asked only where the publisher prices some topics differently, and it is
   * what `priceMinor` was computed from. Undefined on orders placed before
   * topics existed.
   */
  topic?: string;
  priceMinor: number;
  /**
   * The standard rate when this was bought, so the order still explains its
   * own price after the rate card moves on. Equal to `priceMinor` unless a
   * premium applied.
   */
  listPriceMinor?: number;
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

export type PaymentStatus = 'unpaid' | 'processing' | 'paid' | 'refunded' | 'failed';

export interface Order {
  id: string;
  /** Human readable reference, e.g. "LM-10428". */
  reference: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  /**
   * Where the money got to, which is not the same question as where the work
   * got to. A paid order sits in 'draft' for the moment between the customer
   * returning from Stripe and the webhook arriving.
   */
  paymentStatus?: PaymentStatus;
  /** The net: the sum of the placement prices, before VAT. */
  totalMinor: number;
  /** VAT charged, from Stripe. Undefined until the payment lands. */
  taxMinor?: number;
  /** What Stripe actually took. Undefined until the payment lands. */
  chargedMinor?: number;
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
  /**
   * What the placement is about, where the publisher prices topics
   * differently. Blank means the buyer has not answered yet, which blocks
   * checkout on that line rather than quietly billing the standard rate.
   */
  topic?: string;
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
