import type { MajesticReading } from './parse';

/**
 * What a file holds, before anything is written.
 *
 * Shown on the import screen so the decision to apply is made against numbers
 * rather than a filename. Pure, so the wording can be checked without a file.
 */
export function acceptedOrEmpty(readings: readonly MajesticReading[]): {
  withTopics: number;
  suggested: number;
  withTrustFlow: number;
} {
  return {
    withTopics: readings.filter((reading) => reading.topics.length > 0).length,
    suggested: readings.filter((reading) => reading.suggestedNiche != null).length,
    withTrustFlow: readings.filter((reading) => reading.trustFlow != null).length,
  };
}
