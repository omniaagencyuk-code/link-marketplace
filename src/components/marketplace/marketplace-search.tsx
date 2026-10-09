'use client';

import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search';

/**
 * The search over the listings.
 *
 * The sidebar has had a search box since the marketplace was built, and it
 * is the wrong place for the first thing most people want to do: a buyer
 * arriving with a domain or a subject in mind had to find a filter panel to
 * type it into.
 *
 * Both boxes write the same filter and share `useDebouncedSearch`, so a term
 * typed here appears there and neither re-fires a search for a value the
 * other just set.
 *
 * ## The button is not decoration, and it is not required either
 *
 * Typing already searches after a pause - that is what keeps a nine-letter
 * word from being nine queries. The button commits immediately, as does
 * Enter, because a visible Search button is what people expect to be able to
 * press and a form that ignores Enter feels broken. Pressing it when nothing
 * has changed does nothing at all rather than re-running the same query.
 */
export function MarketplaceSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { typed, setTyped, commitNow } = useDebouncedSearch(value, onChange);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        commitNow();
      }}
      className="flex items-center gap-2 rounded-[var(--radius-card)] border border-line bg-white p-2 shadow-[var(--shadow-card)]"
    >
      <label htmlFor="marketplace-search" className="sr-only">
        Search domains, niches or keywords
      </label>
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          id="marketplace-search"
          type="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Search domains, niches or keywords (e.g. tech news, travel, fitness...)"
          className="h-11 w-full rounded-lg border-0 bg-transparent pr-3 pl-10 text-[14px] text-ink outline-none placeholder:text-muted focus:ring-0"
        />
      </div>
      <Button type="submit" variant="accent" size="lg" className="shrink-0">
        Search
      </Button>
    </form>
  );
}
