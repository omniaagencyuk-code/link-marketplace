import type { ImportFieldKey } from './fields';
import type { CountryCode, LanguageCode, NicheSlug, WebsiteStatus } from '@/lib/types';

export type RowStatus = 'ready' | 'warning' | 'error' | 'existing' | 'duplicate';

export interface RowIssue {
  field?: ImportFieldKey;
  message: string;
  severity: 'error' | 'warning';
}

/** Typed values produced from one CSV row. Only supplied fields are present. */
export interface RowValues {
  domain?: string;
  website_name?: string;
  description?: string;
  primary_niche?: NicheSlug;
  secondary_niches?: NicheSlug[];
  country?: CountryCode;
  language?: LanguageCode;
  domain_rating?: number;
  organic_traffic?: number;
  referring_domains?: number;
  top_country_share?: number;
  traffic_change_pct?: number;
  spam_score?: number;
  guest_post_price?: number;
  niche_edit_price?: number;
  digital_pr_price?: number;
  guest_post_cost?: number;
  niche_edit_cost?: number;
  digital_pr_cost?: number;
  currency?: string;
  turnaround_min_days?: number;
  turnaround_max_days?: number;
  dofollow?: boolean;
  sponsored_tag?: boolean;
  minimum_word_count?: number;
  maximum_links?: number;
  accepted_niches?: string[];
  restricted_niches?: string[];
  notes?: string;
  status?: WebsiteStatus;
  /**
   * Price overrides, one key per niche column the file supplied. Major units,
   * like every other price here.
   */
  [nichePrice: `niche_price_${string}`]: unknown;
}

export interface PreparedRow {
  /** 1-based line number in the uploaded file, excluding the header. */
  rowNumber: number;
  /** The original cells, kept for the error report. */
  raw: Record<string, string>;
  domain: string;
  values: RowValues;
  /** Fields the CSV actually supplied, so updates never blank a value. */
  supplied: ImportFieldKey[];
  issues: RowIssue[];
  status: RowStatus;
  /** Set when the domain already exists in the marketplace. */
  existingId?: string;
  /** Row number this duplicates, when the clash is inside the file. */
  duplicateOfRow?: number;
  selected: boolean;
}

export type DuplicateMode = 'skip' | 'update' | 'review';

export interface ImportCounts {
  total: number;
  ready: number;
  warning: number;
  error: number;
  existing: number;
  duplicate: number;
}

/** One unit of work sent to the server. */
export interface ImportPayloadRow {
  rowNumber: number;
  domain: string;
  values: RowValues;
  supplied: ImportFieldKey[];
  existingId?: string;
}

export interface ImportBatchResult {
  created: number;
  updated: number;
  skipped: number;
  failed: { rowNumber: number; domain: string; reason: string }[];
}
