'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Marketplace search in the hero. Behaviour is unchanged: it pushes the term
 * to /websites, where the existing filter state picks it up from the URL.
 */
export function HeroSearch() {
  const router = useRouter();
  const [term, setTerm] = useState('');

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const query = term.trim();
    router.push(query ? `/websites?q=${encodeURIComponent(query)}` : '/websites');
  }

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      className="flex flex-col gap-2 rounded-xl border border-line bg-white p-2 shadow-[var(--shadow-raised)] sm:flex-row sm:items-center"
    >
      <label htmlFor="hero-search" className="sr-only">
        Search websites by niche, keyword or domain
      </label>
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          id="hero-search"
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search websites by niche, keyword or domain..."
          className="h-12 w-full rounded-lg bg-transparent pr-3 pl-11 text-[15px] text-ink placeholder:text-muted-soft focus:outline-none"
        />
      </div>
      <Button type="submit" variant="accent" size="lg" className="sm:w-auto sm:px-7">
        Search
      </Button>
    </form>
  );
}
