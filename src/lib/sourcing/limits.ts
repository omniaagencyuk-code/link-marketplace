/**
 * Limits shared by the extraction service and the page that drives it.
 *
 * Pure on purpose: the button needs these to say what pressing it will do,
 * and importing them from the service would drag the service-role Supabase
 * client into the browser bundle.
 */

/**
 * How many emails one real-time run reads.
 *
 * Real time makes one call after another inside a single request. Each is a
 * long call - a thread read whole, with adaptive thinking - so this is bounded
 * by how long a serverless function is allowed to live, not by anything the
 * API minds.
 */
export const REALTIME_EXTRACTION_LIMIT = 25;

/**
 * How many go into one batch submission.
 *
 * Nothing here is waited on: the requests are handed over in one call and
 * collected later, so the ceiling is the size of that call rather than the
 * time it takes. The Batch API accepts far more than this in one go; five
 * hundred keeps the submission comfortably small while turning a backlog of
 * eight hundred into two presses instead of thirty-two.
 *
 * It was 25 for both modes, which was the real-time limit applied to a mode
 * that does not have that problem.
 */
export const BATCH_EXTRACTION_LIMIT = 500;

/** What one press of Read will send, in the mode it is set to. */
export function extractionLimit(mode: 'realtime' | 'batch'): number {
  return mode === 'batch' ? BATCH_EXTRACTION_LIMIT : REALTIME_EXTRACTION_LIMIT;
}
