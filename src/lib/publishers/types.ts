import type { PlacementType, SubmissionCurrency, SubmissionSource, SubmissionStatus } from './options';

/**
 * A stored offer of a site, as every screen sees it.
 *
 * Here rather than beside the service because the admin table is a client
 * component, and importing a type from the service drags the whole module -
 * and with it the server-only Supabase client - into the browser bundle.
 */
export interface PublisherSubmission {
  id: string;
  fullName: string;
  email: string;
  domain: string;
  placementType?: PlacementType;
  /** Minor units, and never present without a currency. */
  priceMinor?: number;
  currency?: SubmissionCurrency;
  message?: string;
  source: SubmissionSource;
  status: SubmissionStatus;
  /** Set when the domain is one we already hold a listing for. */
  matchedWebsiteId?: string;
  handledBy?: string;
  handledAt?: string;
  notes?: string;
  createdAt: string;
}

/**
 * Paged from the first version rather than when it hurts.
 *
 * 0068 recorded PostgREST capping a response at a thousand rows and saying
 * nothing in it. A form anybody on the internet can submit is exactly the
 * table that reaches a thousand rows without anybody deciding it should.
 */
export const SUBMISSION_PAGE_SIZE = 50;
