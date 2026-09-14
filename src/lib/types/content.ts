/**
 * Content ordering.
 *
 * A content order is independent of a placement: a customer can buy writing
 * without buying a link, and vice versa. The two share a customer and a
 * billing view but nothing else, so they are modelled separately rather than
 * overloading `Order` with nullable placement fields.
 */

export type ContentTypeSlug =
  | 'seo-article'
  | 'blog-post'
  | 'guest-post'
  | 'landing-page'
  | 'website-copy'
  | 'other';

export type ContentLanguageCode = 'en-GB' | 'en-US';

export type ContentToneSlug =
  | 'professional'
  | 'conversational'
  | 'authoritative'
  | 'friendly'
  | 'technical'
  | 'persuasive';

export type ContentOrderStatus =
  | 'draft'
  | 'brief-received'
  | 'writing'
  | 'editing'
  | 'ready-for-review'
  | 'revision-requested'
  | 'complete'
  | 'cancelled';

/** The brief for a single article. */
export interface ContentBrief {
  /** The customer's own website or brand this content is for. */
  brand: string;
  topic: string;
  suggestedTitle?: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  targetUrl?: string;
  anchorText?: string;
  wordCount: number;
  contentType: ContentTypeSlug;
  country?: string;
  language: ContentLanguageCode;
  tone: ContentToneSlug;
  audience?: string;
  references: string[];
  instructions?: string;
  /**
   * Optional brief document. Only the file's name and size are recorded until
   * object storage is connected - see `contentService` for the swap point.
   */
  briefFileName?: string;
  briefFileSize?: number;
}

/** A revision the customer has asked for, with the response. */
export interface ContentRevision {
  id: string;
  requestedAt: string;
  notes: string;
  resolvedAt?: string;
}

/** A message on a content order, between the customer and the team. */
export interface ContentMessage {
  id: string;
  authorRole: 'customer' | 'team';
  authorName: string;
  body: string;
  createdAt: string;
}

/** A delivered draft or final article. */
export interface ContentDelivery {
  id: string;
  /** "draft" for a review copy, "final" once approved. */
  kind: 'draft' | 'final';
  fileName: string;
  /** Plain text of the article, when it was pasted rather than uploaded. */
  body?: string;
  deliveredAt: string;
}

export interface ContentOrderItem {
  id: string;
  orderId: string;
  reference: string;
  brief: ContentBrief;
  status: ContentOrderStatus;
  priceMinor: number;
  /** Internal only - never sent to a customer view. */
  writerName?: string;
  internalNotes?: string;
  revisions: ContentRevision[];
  messages: ContentMessage[];
  deliveries: ContentDelivery[];
  createdAt: string;
  updatedAt: string;
}

export interface ContentOrder {
  id: string;
  /** Human readable reference, e.g. "PPC-1042". */
  reference: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  status: ContentOrderStatus;
  totalMinor: number;
  currency: 'GBP' | 'USD' | 'EUR';
  items: ContentOrderItem[];
  placedAt: string;
  updatedAt: string;
}

/** An article in the client-side content basket, before checkout. */
export interface ContentDraftItem {
  id: string;
  brief: ContentBrief;
  /** How many copies of this brief to order. */
  quantity: number;
  addedAt: string;
}

/**
 * How content is priced.
 *
 * `perWord` multiplies the word count; `tiered` uses a fixed price for each
 * offered length. Both ship empty - real prices are set in admin settings, and
 * the public page shows "pricing on request" until they are.
 */
export interface ContentPricing {
  mode: 'per-word' | 'tiered';
  /** Minor units per word, used when mode is "per-word". */
  perWordMinor: number;
  /** Fixed price per word-count tier, used when mode is "tiered". */
  tiers: { words: number; priceMinor: number }[];
  /** Percentage added for each content type, on top of the base price. */
  typeSurchargePct: Partial<Record<ContentTypeSlug, number>>;
}
