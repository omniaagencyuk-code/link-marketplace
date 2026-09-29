import { cn } from '@/lib/utils/cn';
import type { WebsiteTopic } from '@/lib/types';

/**
 * Trust Flow and Citation Flow, where they have been measured.
 *
 * Nothing at all when they have not. An unmeasured site showing "TF 0" is a
 * claim we have not made, and 0 is a real and terrible reading - so the two
 * must not look the same.
 */
export function FlowMetrics({
  trustFlow,
  citationFlow,
  className,
}: {
  trustFlow?: number;
  citationFlow?: number;
  className?: string;
}) {
  if (trustFlow == null && citationFlow == null) return null;

  return (
    <span className={cn('inline-flex items-center gap-2 text-[12px]', className)}>
      {trustFlow != null ? (
        <span title="Majestic Trust Flow: how trustworthy the sites linking here are, 0-100.">
          <span className="text-muted">TF</span>{' '}
          <span className="tabular font-semibold text-ink">{trustFlow}</span>
        </span>
      ) : null}
      {citationFlow != null ? (
        <span title="Majestic Citation Flow: how many links point here, weighted, 0-100.">
          <span className="text-muted">CF</span>{' '}
          <span className="tabular font-semibold text-ink">{citationFlow}</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * The three topics that link to a site most strongly.
 *
 * Shown as what they are - a description of the backlink profile - and not as
 * categories. The listing's own category is a separate line on the card, and
 * the two disagreeing is normal rather than a fault: a gambling site whose
 * links come from tech directories is a real and common thing.
 */
export function TopicChips({
  topics,
  className,
  max = 3,
}: {
  topics: WebsiteTopic[];
  className?: string;
  max?: number;
}) {
  if (topics.length === 0) return null;

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {topics.slice(0, max).map((topic) => (
        <span
          key={topic.topic}
          title={`Majestic attributes ${topic.value} of this site's trust flow to ${topic.topic}.`}
          className="inline-flex items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-soft"
        >
          {/* The leaf, because "Recreation/Travel" in a chip is mostly the
              word Recreation. The full path is in the title for anyone who
              wants it. */}
          {topic.topic.split('/').pop()}
          <span className="tabular text-muted">{topic.value}</span>
        </span>
      ))}
    </span>
  );
}
