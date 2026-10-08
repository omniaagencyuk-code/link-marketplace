'use client';

import { useEffect, useState } from 'react';
import { listingsByIdAction } from '@/app/dashboard/actions';
import { LISTINGS_PER_REQUEST, listingIdsToFetch } from '@/lib/dashboard/listing-batch';
import { chunk } from '@/lib/utils/chunk';
import type { WebsiteListItem } from '@/lib/types';

export interface Listings {
  /** The listings found, in no particular order. Look them up by id. */
  items: WebsiteListItem[];
  /** True until the first answer for the current ids arrives. */
  loading: boolean;
  /** Set when the fetch failed. The page still renders what it has. */
  error: string | null;
}

/** One reference, so an empty result does not re-render everything that reads it. */
const NOTHING: WebsiteListItem[] = [];

interface Answer {
  /** The ids this answer is for. Anything else on screen is stale. */
  key: string;
  items: WebsiteListItem[];
  error: string | null;
}

/**
 * The listings behind a set of ids held in the browser.
 *
 * The basket and the shortlist are local storage, so their ids are only known
 * after hydration. Both pages used to be handed every active listing instead,
 * which was a few hundred rows when it was written and is 3,405 now, with
 * 7,174 more approved and waiting to be published.
 *
 * Chunked, because one request has a server-side cap and a shortlist can be
 * longer than one request. Sent together rather than one after another: these
 * are a handful of small reads, and waiting for each in turn would trade one
 * slow page for another.
 *
 * `loading` is derived from whether the stored answer matches the ids being
 * asked about, rather than being a flag the effect sets. Setting state
 * synchronously inside an effect makes React render twice for every change -
 * and the empty-basket case did it on every single render, because
 * `listingIdsToFetch` returns a fresh array each time. Comparing the joined
 * string answers the same question without storing it.
 */
export function useListings(ids: readonly string[], ready = true): Listings {
  const [answer, setAnswer] = useState<Answer | null>(null);

  const wanted = listingIdsToFetch(ids);
  const key = wanted.join(',');
  const current = answer?.key === key ? answer : null;

  useEffect(() => {
    if (!ready || key === '') return;

    // Flipped by the cleanup when the ids change mid-flight, so a slower
    // earlier answer cannot overwrite a newer one.
    let live = true;
    const asked = key.split(',');

    Promise.all(chunk(asked, LISTINGS_PER_REQUEST).map((group) => listingsByIdAction(group)))
      .then((batches) => {
        if (live) setAnswer({ key, items: batches.flat(), error: null });
      })
      .catch(() => {
        if (live) {
          setAnswer({
            key,
            items: [],
            error: 'Could not load these listings. Refresh the page to try again.',
          });
        }
      });

    return () => {
      live = false;
    };
  }, [key, ready]);

  if (key === '') return { items: NOTHING, loading: false, error: null };

  return {
    items: current?.items ?? NOTHING,
    loading: ready && current === null,
    error: current?.error ?? null,
  };
}
