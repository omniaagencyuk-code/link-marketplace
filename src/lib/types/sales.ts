/**
 * The Sales Centre: who we are selling to.
 *
 * Every type here describes internal data. A prospect is a company somebody
 * decided to approach, a qualification is a judgement about them, a contact is
 * a named person's work address. None of it has a customer-facing shape and
 * none of it should acquire one - if a field here ever needs to reach a
 * browser, that is the moment to ask whether it belongs in this feature at
 * all.
 */

/** What kind of business this is, which decides the pitch. */
export type SalesSegment =
  | 'seo_agency'
  | 'digital_pr'
  | 'link_building'
  | 'affiliate_igaming'
  | 'affiliate_sports'
  | 'affiliate_finance'
  | 'affiliate_other'
  | 'ecommerce'
  | 'saas'
  | 'publisher_network'
  | 'other';

/** Where a prospect is in the pipeline. */
export type ProspectStage =
  | 'new'
  | 'researching'
  | 'qualified'
  | 'disqualified'
  | 'contacted'
  | 'replied'
  | 'in_conversation'
  | 'won'
  | 'lost'
  | 'unsubscribed';

export type OutboundStatus =
  | 'draft'
  | 'needs_review'
  | 'approved'
  | 'scheduled'
  | 'sent'
  | 'failed'
  | 'bounced'
  | 'cancelled';

export type ReplyClassification =
  | 'interested'
  | 'question'
  | 'not_now'
  | 'not_interested'
  | 'unsubscribe'
  | 'out_of_office'
  | 'bounce'
  | 'other';

export type ProspectSource = 'manual' | 'csv' | 'crawl' | 'referral' | 'inbound';
export type SweepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type ContactsStatus = 'pending' | 'running' | 'found' | 'none' | 'failed' | 'skipped';

/**
 * What the crawl established without asking a model.
 *
 * Deliberately separate from the model's reading: these are counts and
 * presences, and a prompt change cannot rewrite them. When a qualification
 * turns out to be wrong, the evidence it was made from is still here.
 */
export interface ProspectSignals {
  pagesFetched?: number;
  /** Phrases found in their own copy, with the page each came from. */
  matchedTerms?: { term: string; url: string }[];
  hasServicesPage?: boolean;
  hasPricingPage?: boolean;
  hasBlog?: boolean;
  /** Outbound links to known affiliate or casino brands, where any were found. */
  outboundBrands?: string[];
}

export interface Prospect {
  id: string;
  /** Random, used in anything a stranger might receive. Never the row id. */
  publicToken: string;
  companyName: string;
  domain: string;
  websiteUrl?: string;
  segment: SalesSegment;
  stage: ProspectStage;
  countryCode?: string;
  source: ProspectSource;
  sourceDetail?: string;

  researchStatus: SweepStatus;
  researchedAt?: string;
  researchError?: string;
  signals: ProspectSignals;

  /** Null until a model has read them. Not the same as false. */
  qualified?: boolean;
  qualifiedAt?: string;
  disqualifiedReason?: string;

  /** 0-100, or undefined where nothing has been scored yet. */
  score?: number;
  scoreBreakdown: Record<string, number>;
  scoredAt?: string;

  contactsStatus: ContactsStatus;
  contactsCheckedAt?: string;

  owner?: string;
  notes?: string;
  lastContactedAt?: string;
  lastReplyAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProspectPage {
  id: string;
  prospectId: string;
  url: string;
  kind: 'home' | 'about' | 'services' | 'pricing' | 'clients' | 'blog' | 'contact' | 'other';
  httpStatus?: number;
  title?: string;
  /** Plain text. Markup was removed before this was stored, and it is never
   * rendered as HTML. */
  textExcerpt: string;
  bytes?: number;
  error?: string;
  fetchedAt: string;
}

/** A claim, and the sentence it was read from. A claim with no quote behind
 * it is the model writing copy about a company it invented. */
export interface QualificationReason {
  claim: string;
  quote: string;
  url?: string;
}

export interface ProspectQualification {
  id: string;
  prospectId: string;
  verdict: 'likely_buyer' | 'unlikely' | 'unclear';
  confidence: number;
  segmentGuess?: SalesSegment;
  reasons: QualificationReason[];
  buyingSignals: QualificationReason[];
  model: string;
  promptVersion: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  createdAt: string;
}

export interface ProspectContact {
  id: string;
  prospectId: string;
  email: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  seniority?: string;
  department?: string;
  linkedinUrl?: string;
  /** Hunter's own score. Undefined means nobody scored it, which is not a low
   * score. */
  emailConfidence?: number;
  verification: 'unverified' | 'valid' | 'accept_all' | 'invalid' | 'unknown';
  source: 'hunter' | 'manual' | 'crawl';
  /** The one we would write to. At most one per prospect, enforced by a
   * partial unique index. */
  selected: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A listing this email cites, kept by id so the claim can be checked against
 * the inventory rather than taken on trust. */
export interface MatchedListing {
  websiteId: string;
  domain: string;
  domainRating: number;
  organicTraffic: number;
  /** Minor units, what a customer would pay. */
  priceMinor: number;
  niche?: string;
}

export interface OutboundEmail {
  id: string;
  prospectId: string;
  contactId?: string;
  campaignId?: string;
  stepNumber: number;
  toAddress: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  status: OutboundStatus;
  statusReason?: string;
  matchedInventory: MatchedListing[];
  model?: string;
  promptVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  edited: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  scheduledAt?: string;
  sentAt?: string;
  providerId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesCampaign {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'done' | 'cancelled';
  segment?: SalesSegment;
  minScore?: number;
  /** Guidance for the generator, not the email. The email is written per
   * prospect from their own site and our inventory. */
  angle: string;
  dailyCap?: number;
  fromAddress?: string;
  replyTo?: string;
  createdBy?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignStep {
  id: string;
  campaignId: string;
  stepNumber: number;
  delayDays: number;
  purpose: string;
  guidance: string;
}

export interface SalesReply {
  id: string;
  prospectId?: string;
  outboundEmailId?: string;
  contactId?: string;
  messageId: string;
  fromAddress: string;
  subject?: string;
  bodyText: string;
  receivedAt?: string;
  classification?: ReplyClassification;
  classifiedBy?: 'ai' | 'human';
  confidence?: number;
  handled: boolean;
  handledBy?: string;
  handledAt?: string;
  createdAt: string;
}

export interface ProspectEvent {
  id: string;
  prospectId: string;
  kind: string;
  summary: string;
  detail: Record<string, unknown>;
  actor?: string;
  createdAt: string;
}

export interface SalesSuppression {
  id: string;
  email?: string;
  domain?: string;
  reason: 'unsubscribed' | 'bounced' | 'complained' | 'manual' | 'do_not_contact';
  note?: string;
  createdBy?: string;
  createdAt: string;
}

export interface SalesSettings {
  enabled: boolean;
  dryRun: boolean;
  model: string;
  monthlyAiBudgetUsd: number;
  hunterMonthlyCreditBudget: number;
  hunterCreditSafetyPct: number;
  hunterCycleDay: number;
  dailySendCap: number;
  perDomainOpenCap: number;
  maxFollowUps: number;
  followUpGapDays: number;
  sendFrom?: string;
  sendReplyTo?: string;
  crawlMaxPages: number;
  minScoreToContact: number;
  updatedAt: string;
  updatedBy?: string;
}

export type SalesRunKind =
  | 'research'
  | 'qualify'
  | 'score'
  | 'contacts'
  | 'draft'
  | 'send'
  | 'replies';

export interface SalesRun {
  id: string;
  kind: SalesRunKind;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  reason?: string;
  dryRun: boolean;
  looked: number;
  succeeded: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  creditsSpent: number;
  leasedUntil?: string;
  startedBy?: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}
