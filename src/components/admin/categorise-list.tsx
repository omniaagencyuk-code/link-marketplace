'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { nicheName } from '@/lib/data/categories';
import { readHomepageAction, applyCategoryAction } from '@/app/admin/(protected)/categorise/actions';
import type { CategoryRead } from '@/lib/services/category-read-service';

/**
 * The uncategorised backlog, one homepage at a time.
 *
 * Two things this screen is built around.
 *
 * The quote is shown, not hidden behind the category. What is being reviewed
 * is whether the page says what the model claims it says, and a category on
 * its own is something to agree with rather than something to check -
 * `readNiche` has already confirmed the sentence is really in the page, so
 * what is left for a person is whether it means what the model took it to
 * mean.
 *
 * A declined read is shown as plainly as a proposal. "The model could not
 * tell" and "nobody has looked yet" are different states, and a screen that
 * showed only successes would offer the same empty row for both - so the
 * same site would be read again and again at the same cost.
 */

/** What each refusal means, in words a reviewer can act on. */
const WHY: Record<string, string> = {
  'model-said-unknown': 'The homepage does not say what the site is about.',
  'below-the-floor': 'Too unsure to be worth your time.',
  'no-quote': 'No sentence was offered as evidence.',
  'quote-not-on-the-page': 'It quoted a sentence the page does not contain.',
  'could-not-read-the-page': 'The page could not be fetched or had nothing to read.',
  'the-model-call-failed': 'The model call failed.',
};

export function CategoriseList({
  websites,
  reads,
  total,
  page,
  pageSize,
}: {
  websites: { id: string; slug: string; domain: string; title: string }[];
  reads: Record<string, CategoryRead>;
  total: number;
  page: number;
  pageSize: number;
}) {
  const [busy, startTransition] = useTransition();
  const [live, setLive] = useState<Record<string, CategoryRead>>(reads);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function read(websiteId: string) {
    setWorking(websiteId);
    startTransition(async () => {
      const result = await readHomepageAction(websiteId);
      if (result) setLive((current) => ({ ...current, [websiteId]: result }));
      setWorking(null);
    });
  }

  function apply(websiteId: string) {
    setWorking(websiteId);
    startTransition(async () => {
      const { applied: ok } = await applyCategoryAction(websiteId);
      if (ok) setApplied((current) => new Set(current).add(websiteId));
      setWorking(null);
    });
  }

  if (websites.length === 0) {
    return (
      <p className="text-[14px] text-muted">
        Nothing to categorise - every active listing has a category.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">
        <span className="tabular font-medium text-ink">{total.toLocaleString('en-GB')}</span>{' '}
        active {total === 1 ? 'listing has' : 'listings have'} no category. Showing page{' '}
        {page} of {totalPages}.
      </p>

      <TableWrap>
        <Table>
          <caption className="sr-only">
            Active listings with no category, and what reading their homepage found
          </caption>
          <thead>
            <tr>
              <Th>Website</Th>
              <Th>What its homepage says</Th>
              <Th className="text-right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {websites.map((website) => {
              const found = live[website.id];
              const isApplied = applied.has(website.id) || Boolean(found?.appliedAt);
              const pending = busy && working === website.id;

              return (
                <Tr key={website.id}>
                  <Td className="align-top">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/websites/${website.slug}`}
                        className="text-[14px] font-semibold text-ink hover:text-accent-700"
                      >
                        {website.domain}
                      </Link>
                      <a
                        href={`https://${website.domain}`}
                        target="_blank"
                        rel="noreferrer noopener nofollow"
                        className="text-accent-600 hover:text-accent-700"
                        aria-label={`Open ${website.domain} in a new tab`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted">{website.title}</p>
                  </Td>

                  <Td className="align-top">
                    {!found ? (
                      <span className="text-[13px] text-muted">Not read yet.</span>
                    ) : found.niche ? (
                      <div className="space-y-1">
                        <p className="text-[13px] text-ink">
                          <span className="font-semibold">{nicheName(found.niche)}</span>
                          <span className="tabular ml-2 text-[12px] text-muted">
                            {found.confidence}% sure
                          </span>
                        </p>
                        {/* The sentence it was read from, which is the thing
                            actually being judged. */}
                        <p className="border-l-2 border-line pl-2 text-[12px] leading-relaxed text-ink-soft">
                          &ldquo;{found.quote}&rdquo;
                        </p>
                        {found.reason ? (
                          <p className="text-[12px] text-muted">{found.reason}</p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-[13px] text-ink-soft">
                          {WHY[found.declinedBecause ?? ''] ?? 'No category was proposed.'}
                        </p>
                        {found.reason ? (
                          <p className="text-[12px] text-muted">{found.reason}</p>
                        ) : null}
                      </div>
                    )}
                  </Td>

                  <Td className="align-top text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isApplied ? (
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-700">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Applied
                        </span>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => read(website.id)}
                          >
                            <Search className="h-3.5 w-3.5" aria-hidden="true" />
                            {found ? 'Read again' : 'Read homepage'}
                          </Button>
                          {found?.niche ? (
                            <Button
                              size="sm"
                              variant="accent"
                              disabled={pending}
                              onClick={() => apply(website.id)}
                            >
                              Accept
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>

      {/*
        `disabled` on a `Button asChild` renders an anchor, and `disabled`
        does nothing to an anchor - so at the ends both controls looked
        live and navigated to the page you were already on. A real button
        where there is nowhere to go, and nothing at all on a single page.
      */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <Step to={page - 1} disabled={page <= 1}>
            Previous
          </Step>
          <Step to={page + 1} disabled={page >= totalPages}>
            Next
          </Step>
        </div>
      ) : null}
    </div>
  );
}

function Step({
  to,
  disabled,
  children,
}: {
  to: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button size="sm" variant="outline" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={`/admin/categorise?page=${to}`}>{children}</Link>
    </Button>
  );
}
