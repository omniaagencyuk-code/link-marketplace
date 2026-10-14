import type { EnquirySource, EnquiryStatus } from './options';

/**
 * A stored pricing enquiry, as every screen sees it.
 *
 * Here rather than beside the service because the admin table is a client
 * component, and importing a type from `enquiry-service` drags the whole
 * module - and with it the server-only Supabase client - into the browser
 * bundle. The build says so outright, which is the good version of this
 * mistake; the bad version is a service-role import that builds.
 */
export interface PricingEnquiry {
  id: string;
  fullName: string;
  email: string;
  company?: string;
  budgetBand?: string;
  interest?: string;
  message: string;
  source: EnquirySource;
  status: EnquiryStatus;
  handledBy?: string;
  handledAt?: string;
  notes?: string;
  createdAt: string;
}

/**
 * The admin list is paged from the first version rather than when it hurts.
 *
 * 0068 recorded PostgREST capping a response at a thousand rows and saying
 * nothing in it, and the admin order and website tables were both built to
 * page for that reason. A form anybody on the internet can submit is exactly
 * the table that reaches a thousand rows without anybody deciding it should.
 */
export const ENQUIRY_PAGE_SIZE = 50;
