'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

const popularNiches = [
  { label: 'iGaming', slug: 'igaming' },
  { label: 'Sports', slug: 'sports' },
  { label: 'Finance', slug: 'finance' },
  { label: 'Technology', slug: 'technology' },
  { label: 'Travel', slug: 'travel' },
  { label: 'Lifestyle', slug: 'lifestyle' },
];

/** Large marketplace search field shown in the homepage hero. */
export function HeroSearch() {
  const router = useRouter();
  const [term, setTerm] = useState('');

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const query = term.trim();
    router.push(query ? `/websites?q=${encodeURIComponent(query)}` : '/websites');
  }

  return (
    <div>
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
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id="hero-search"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search websites by niche, keyword or domain..."
            className="h-12 w-full rounded-lg bg-transparent pr-3 pl-10 text-[15px] text-ink placeholder:text-muted-soft focus:outline-none"
          />
        </div>
        <Button type="submit" variant="accent" size="lg" className="sm:w-auto">
          Search
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted">Popular:</span>
        {popularNiches.map((niche) => (
          <Link
            key={niche.slug}
            href={`/websites?niche=${niche.slug}`}
            className="rounded-full border border-line-strong bg-white px-3 py-1 text-[13px] font-medium text-ink-soft transition-colors hover:border-accent-400 hover:text-accent-700"
          >
            {niche.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
