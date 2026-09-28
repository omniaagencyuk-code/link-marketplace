'use client';

import { Target, X } from 'lucide-react';
import { acceptedNiches } from '@/lib/config/accepted-niches';
import type { AcceptedNicheSlug } from '@/lib/types';

/**
 * What are you buying for?
 *
 * Asked once, at the top, because the answer is a property of the campaign
 * rather than of each placement. Somebody buying links for a casino client
 * knows it before they open the page, and answering here means the
 * marketplace only shows publishers who will take it, priced at what they
 * charge for it.
 *
 * Deliberately not styled as a filter chip. Filters narrow an answer; this
 * changes the question, and a buyer who clears it without noticing goes back
 * to prices they cannot actually pay.
 */
export function TopicPicker({
  topic,
  onChange,
  matching,
}: {
  topic?: AcceptedNicheSlug;
  onChange: (topic: AcceptedNicheSlug | undefined) => void;
  matching: number;
}) {
  return (
    <div className="mb-4 rounded-xl border border-line bg-surface-sunken p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label
          htmlFor="buying-for"
          className="flex items-center gap-1.5 text-[13px] font-medium text-ink"
        >
          <Target className="h-4 w-4 text-accent-600" aria-hidden="true" />
          I&rsquo;m buying for
        </label>

        <select
          id="buying-for"
          value={topic ?? ''}
          onChange={(event) =>
            onChange((event.target.value || undefined) as AcceptedNicheSlug | undefined)
          }
          className="h-9 min-w-[200px] rounded-lg border border-line-strong bg-white px-2.5 text-[13px] text-ink"
        >
          <option value="">Anything (show everything)</option>
          {acceptedNiches.map((niche) => (
            <option key={niche.slug} value={niche.slug}>
              {niche.label}
            </option>
          ))}
        </select>

        {topic ? (
          <>
            <span className="text-[12px] text-muted">
              {matching} {matching === 1 ? 'publisher accepts' : 'publishers accept'} it, priced at
              what they charge for it
            </span>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="inline-flex items-center gap-1 text-[12px] text-muted underline hover:text-ink"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              clear
            </button>
          </>
        ) : (
          <span className="text-[12px] text-muted">
            Pick a topic and we&rsquo;ll hide the publishers who will not take it, and show what the
            rest charge for it.
          </span>
        )}
      </div>
    </div>
  );
}
