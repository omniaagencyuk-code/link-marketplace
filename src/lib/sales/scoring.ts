import { isContactable } from '@/lib/config/sales-segments';
import type { Prospect, ProspectQualification, SalesSegment } from '@/lib/types/sales';

/**
 * How worth contacting a prospect is, 0-100.
 *
 * Deterministic, and separate from the model on purpose. The qualification
 * answers "would they buy?"; this answers "should this one be near the top of
 * the list?", and that second question has to be explainable to whoever is
 * working down the list. A score somebody cannot account for is a score they
 * will ignore, and the components are stored alongside it so the panel can
 * show the arithmetic rather than a number.
 *
 * Pure: facts in, a score and its breakdown out. No database, no clock, so
 * every rule below can be checked against the case that triggers it.
 *
 * ## The two hard zeros
 *
 * A competitor scores zero, whatever else is true of them. `publisher_network`
 * sells what we sell, and the cost of pitching one is not a wasted email - it
 * is our price list in the hands of somebody selling against us.
 *
 * A prospect the model read and rejected scores zero. Not a low score: zero,
 * so no combination of a strong segment and a rich site can float a rejected
 * company back up a list sorted by score.
 */

export interface ScoreBreakdown extends Record<string, number> {
  verdict: number;
  confidence: number;
  segment: number;
  evidence: number;
  reachability: number;
}

export interface ScoreResult {
  score: number;
  breakdown: ScoreBreakdown;
  /** Why it is what it is, in one line, for the list and the panel. */
  explanation: string;
}

/**
 * How much each segment is worth being right about.
 *
 * Not a guess at their budget - a guess at how short the conversation is. A
 * link building agency already knows what a placement is and what it should
 * cost, so the only questions left are price and turnaround. An ecommerce
 * brand has to be told what the product is first.
 */
const SEGMENT_WEIGHT: Record<SalesSegment, number> = {
  link_building: 20,
  seo_agency: 18,
  affiliate_igaming: 18,
  affiliate_finance: 16,
  digital_pr: 14,
  affiliate_sports: 14,
  affiliate_other: 10,
  saas: 9,
  ecommerce: 8,
  other: 2,
  publisher_network: 0,
};

const MAX = {
  verdict: 35,
  confidence: 20,
  segment: 20,
  evidence: 15,
  reachability: 10,
} as const;

export function scoreProspect(
  prospect: Pick<Prospect, 'segment' | 'signals' | 'contactsStatus'> & {
    /** Whether a usable address has actually been found and chosen. */
    hasSelectedContact?: boolean;
  },
  qualification?: Pick<ProspectQualification, 'verdict' | 'confidence' | 'reasons' | 'buyingSignals'>,
): ScoreResult {
  const zero: ScoreBreakdown = {
    verdict: 0,
    confidence: 0,
    segment: 0,
    evidence: 0,
    reachability: 0,
  };

  if (!isContactable(prospect.segment)) {
    return {
      score: 0,
      breakdown: zero,
      explanation: 'A publisher or marketplace. They sell what we sell, so they are never pitched.',
    };
  }

  if (qualification?.verdict === 'unlikely') {
    return {
      score: 0,
      breakdown: zero,
      explanation: 'Read and rejected: the site argues against them buying.',
    };
  }

  const breakdown: ScoreBreakdown = { ...zero };

  /*
    The verdict carries the most weight, and `unclear` carries real weight
    rather than none.

    Most companies that buy links say nothing about it on their website, so a
    pipeline that only works `likely_buyer` works a small and self-selecting
    slice of the market. An unread prospect scores lower than an unclear one
    for the opposite reason: there is nothing behind it yet at all.
  */
  if (qualification?.verdict === 'likely_buyer') breakdown.verdict = MAX.verdict;
  else if (qualification?.verdict === 'unclear') breakdown.verdict = Math.round(MAX.verdict * 0.4);
  else breakdown.verdict = 0;

  // Scaled by the verdict it belongs to: high confidence in `unclear` is
  // confidence that we do not know, which is not worth points of its own.
  const confidenceShare = qualification
    ? (qualification.confidence / 100) * (qualification.verdict === 'likely_buyer' ? 1 : 0.35)
    : 0;
  breakdown.confidence = Math.round(MAX.confidence * confidenceShare);

  breakdown.segment = Math.min(MAX.segment, SEGMENT_WEIGHT[prospect.segment] ?? 0);

  /*
    Evidence, counted from quotes rather than from reasons.

    A reason with no quote behind it was supposed to be left out by the prompt,
    and counting only the quoted ones means a model that ignores that rule
    gains nothing by it.
  */
  const quoted = [
    ...(qualification?.reasons ?? []),
    ...(qualification?.buyingSignals ?? []),
  ].filter((reason) => reason.quote.trim().length > 0).length;
  breakdown.evidence = Math.min(MAX.evidence, quoted * 3);

  /*
    Reachability, because an unreachable prospect is not a prospect.

    A perfect fit with no address is work nobody can do, and it should sort
    below a decent fit we can actually write to. It is the smallest component
    so that it reorders equals rather than overriding the judgement.
  */
  if (prospect.hasSelectedContact) breakdown.reachability = MAX.reachability;
  else if (prospect.contactsStatus === 'found') breakdown.reachability = Math.round(MAX.reachability * 0.6);
  else if (prospect.contactsStatus === 'none') breakdown.reachability = 0;
  else breakdown.reachability = Math.round(MAX.reachability * 0.3);

  const score = Math.max(
    0,
    Math.min(
      100,
      breakdown.verdict +
        breakdown.confidence +
        breakdown.segment +
        breakdown.evidence +
        breakdown.reachability,
    ),
  );

  return { score, breakdown, explanation: explain(breakdown, qualification, prospect) };
}

function explain(
  breakdown: ScoreBreakdown,
  qualification: Parameters<typeof scoreProspect>[1],
  prospect: Parameters<typeof scoreProspect>[0],
): string {
  if (!qualification) {
    return 'Not read yet. The score is the segment and whether we can reach them.';
  }

  const parts: string[] = [];

  if (qualification.verdict === 'likely_buyer') {
    parts.push(`Reads as a buyer at ${qualification.confidence}% confidence`);
  } else {
    parts.push('Their site does not say either way');
  }

  if (breakdown.evidence > 0) {
    const quoted = Math.round(breakdown.evidence / 3);
    parts.push(`${quoted} quoted ${quoted === 1 ? 'reason' : 'reasons'}`);
  } else {
    parts.push('nothing quotable found');
  }

  if (!prospect.hasSelectedContact) {
    parts.push(prospect.contactsStatus === 'none' ? 'no address found' : 'no recipient chosen yet');
  }

  return `${parts.join(', ')}.`;
}
