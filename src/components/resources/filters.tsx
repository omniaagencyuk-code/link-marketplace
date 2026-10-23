'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { postCategories } from '@/lib/config/blog';
import { listingHref } from '@/lib/blog/listing';
import type { PostCategorySlug } from '@/lib/types/blog';

/**
 * The search box and the category pills.
 *
 * ## It is a form first
 *
 * A `<form method="get" action="/resources">` with a named input, which
 * means it works before this component's JavaScript arrives and still works
 * if it never does: pressing Enter navigates to `/resources?q=…`, the server
 * renders the results, and the pills are ordinary links the crawler follows
 * and the keyboard reaches. Everything below is enhancement on top of a
 * thing that already worked.
 *
 * That order matters here more than on most screens. This is the page that
 * lists the articles the site is found for, so "the filter needs JavaScript"
 * would mean "the archive needs JavaScript".
 *
 * ## What the enhancement adds
 *
 * Typing navigates on a 250ms debounce through the router, so results update
 * without a document load and the URL stays shareable. `useTransition` keeps
 * the old results on screen while the new ones are fetched rather than
 * blanking the grid, and marks the list as busy while that happens.
 *
 * `replace` rather than `push`, so back leaves the index rather than walking
 * backwards through a search one letter at a time. A reader who typed six
 * characters does not want six history entries, and the URL is still the
 * thing to copy or bookmark - what `push` would buy is an undo nobody asked
 * for at the price of a back button that stops working.
 *
 * The pills stay `<Link>`s rather than becoming buttons. A button would have
 * to reimplement middle-click, open-in-new-tab and the address bar, and a
 * category is a place.
 */
export function ResourceFilters({
  category,
  search,
  resultsId,
}: {
  category?: PostCategorySlug;
  search?: string;
  /** The grid this controls, so the input can own it for a screen reader. */
  resultsId: string;
}) {
  const router = useRouter();
  const applied = search ?? '';
  const [term, setTerm] = useState(applied);
  const [syncedFrom, setSyncedFrom] = useState(applied);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  /*
    The URL changed under us - a back button, a pill, a link from somewhere
    else - so the box takes what it now says.

    Adjusted during render rather than in an effect. Setting state from an
    effect that watches a prop renders once with the stale value and again
    with the fresh one, which is the cascading render React warns about; a
    comparison here re-renders before anything is shown.
  */
  if (applied !== syncedFrom) {
    setSyncedFrom(applied);
    setTerm(applied);
  }

  /*
    Typing navigates, 250ms after it stops. The guard is the URL itself: once
    the replace lands, `applied` is what was typed and there is nothing left
    to do, so the effect cannot chase its own navigation.

    A new search starts at page one - page four of the old results is not a
    page of the new ones - which is why `listingHref` is given no page.
  */
  useEffect(() => {
    if (term === applied) return;
    const timer = setTimeout(() => {
      startTransition(() => router.replace(listingHref({ category, search: term })));
    }, 250);
    return () => clearTimeout(timer);
  }, [term, applied, category, router]);

  return (
    <div>
      <form
        action="/resources"
        method="get"
        role="search"
        onSubmit={(event) => {
          /* With JavaScript the debounce has already navigated, or is about
             to; let Enter do it now rather than reloading the document. */
          event.preventDefault();
          startTransition(() => router.replace(listingHref({ category, search: term })));
        }}
      >
        {/* Carried so that a submit without JavaScript keeps the category
            the reader is looking at. */}
        {category ? <input type="hidden" name="category" value={category} /> : null}

        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-4 h-4 w-4 text-muted"
            aria-hidden="true"
          />
          <input
            ref={input}
            type="search"
            name="q"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search articles, guides or topics…"
            aria-label="Search articles"
            aria-controls={resultsId}
            autoComplete="off"
            className="h-12 w-full rounded-full border border-line-strong bg-white pr-24 pl-11 text-[14px] text-ink shadow-[var(--shadow-card)] transition-colors outline-none placeholder:text-muted focus-visible:border-accent-500 focus-visible:ring-2 focus-visible:ring-accent-200"
          />

          {term ? (
            <button
              type="button"
              onClick={() => {
                setTerm('');
                input.current?.focus();
              }}
              className="absolute right-14 flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-200 focus-visible:outline-none"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Clear the search</span>
            </button>
          ) : null}

          <button
            type="submit"
            className="absolute right-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-accent-700 text-white transition-colors hover:bg-accent-800 focus-visible:ring-2 focus-visible:ring-accent-200 focus-visible:outline-none"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Search</span>
          </button>
        </div>
      </form>

      <nav aria-label="Article categories" className="mt-4">
        {/*
          Scrollable sideways on a phone rather than wrapping to three rows.
          `-mx-4 px-4` lets the row bleed to the edges of the screen so the
          last pill is reachable without the page itself scrolling.
        */}
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <li className="shrink-0">
            <Pill href={listingHref({ search: term })} active={!category} label="All" />
          </li>
          {postCategories.map((entry) => (
            <li key={entry.slug} className="shrink-0">
              <Pill
                href={listingHref({ category: entry.slug, search: term })}
                active={category === entry.slug}
                label={entry.name}
              />
            </li>
          ))}
        </ul>
      </nav>

      {/* Announced, not drawn: the grid dims itself while a navigation is in
          flight, and this is what a screen reader gets instead. */}
      <p aria-live="polite" className="sr-only">
        {pending ? 'Updating results' : ''}
      </p>
    </div>
  );
}

function Pill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'inline-flex rounded-full bg-accent-700 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-accent-200 focus-visible:outline-none'
          : 'inline-flex rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-accent-300 hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-accent-200 focus-visible:outline-none'
      }
    >
      {label}
    </Link>
  );
}
