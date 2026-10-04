import type { LinkStatus } from './status';

/**
 * The shapes the rest of the application sees.
 *
 * Kept apart from the store so a page can import a type without importing a
 * Supabase client, and so the column names stay in one file.
 */

export type ClaimStatus =
  | 'awaiting_publisher'
  | 'restored'
  | 'awaiting_buyer_choice'
  | 'replacement_requested'
  | 'refund_requested'
  | 'closed';

export interface MonitoredLink {
  id: string;
  orderItemId: string;
  orderId: string;
  websiteId: string;
  buyerId: string;
  placedUrl: string;
  targetUrl: string;
  expectsDofollow: boolean;
  publishedAt: string;
  guaranteeEndsAt: string;
  status: LinkStatus;
  hardFailures: number;
  softFailures: number;
  lostAt?: string;
  lastCheckedAt?: string;
  lastHttpStatus?: number;
  lastReason?: string;
  finalUrl?: string;
  nextCheckAt: string;
}

export interface GuaranteeClaim {
  id: string;
  linkId: string;
  orderId: string;
  orderItemId: string;
  buyerId: string;
  websiteId: string;
  status: ClaimStatus;
  reason: string;
  openedAt: string;
  publisherDeadline: string;
  resolvedAt?: string;
  amountMinor: number;
  currency: string;
}

/** A link and whatever claim is open against it, for one order page. */
export interface LinkWithClaim {
  link: MonitoredLink;
  domain: string;
  claim?: GuaranteeClaim;
}

/** Is the twelve month window still running on this link? */
export function underGuarantee(link: MonitoredLink, now: Date = new Date()): boolean {
  return new Date(link.guaranteeEndsAt).getTime() > now.getTime();
}
