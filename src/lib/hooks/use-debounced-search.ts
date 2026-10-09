'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * How long a pause counts as having finished typing.
 *
 * Short enough not to feel laggy, long enough that an ordinary word is one
 * search rather than one per letter. 300ms is what the sidebar has always
 * used; kept rather than rounded, because changing the feel of the search
 * was not the point of moving it.
 */
export const SEARCH_PAUSE_MS = 300;

/**
 * A search box whose typing is local and whose pauses are searches.
 *
 * Extracted because there are two boxes bound to the same filter now - the
 * one over the listings and the one in the sidebar - and two copies of this
 * is two debounces to drift apart. They have to agree: a term typed in one
 * appears in the other, and neither may re-fire a search for a value it was
 * just handed.
 *
 * Three behaviours, and the third is the one that is easy to miss:
 *
 *   * typing updates the local value and nothing else;
 *   * a pause commits it to the filter, which runs the query;
 *   * a filter that changes from anywhere else - Reset, the other box, a
 *     term arriving in the URL - is copied back in without being committed
 *     again, or the two boxes would volley.
 *
 * `committed` is a ref rather than state: it records what has already been
 * sent so the effects can tell a change apart from an echo, and recording it
 * must not itself cause a render.
 */
export function useDebouncedSearch(value: string, onCommit: (next: string) => void) {
  const [typed, setTyped] = useState(value);
  const committed = useRef(value);

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setTyped(value);
    }
  }, [value]);

  useEffect(() => {
    if (typed === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = typed;
      onCommit(typed);
    }, SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [typed, onCommit]);

  /** Enter, or the Search button: commit now rather than waiting out the pause. */
  const commitNow = () => {
    if (typed === committed.current) return;
    committed.current = typed;
    onCommit(typed);
  };

  return { typed, setTyped, commitNow };
}
