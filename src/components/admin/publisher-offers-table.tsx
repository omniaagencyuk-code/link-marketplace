'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Mail, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import {
  deletePublisherSubmissionAction,
  publisherSubmissionPageAction,
  setPublisherSubmissionStatusAction,
} from '@/app/admin/(protected)/publisher-offers/actions';
import {
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_LABELS,
  type SubmissionStatus,
} from '@/lib/publishers/options';
import { SUBMISSION_PAGE_SIZE, type PublisherSubmission } from '@/lib/publishers/types';
import { formatDateTime, formatPrice } from '@/lib/utils/format';

/**
 * Offers of a site, a page at a time.
 *
 * Paged from the first version rather than when it hurts: this is a table a
 * stranger can cause a row in, so its size is nobody's decision, and 0068
 * recorded what an unpaged admin read does when PostgREST caps the response
 * and says nothing in it.
 *
 * Two things are given more room than their width would suggest. The domain,
 * because it is the first thing anybody looks at and the second is whether
 * we already carry it. And the message, whole rather than truncated: it is
 * where a publisher says what they will not take, and an admin who has to
 * click into each one to find that out will stop reading them.
 */
export function PublisherOffersTable() {
  const router = useRouter();
  const [status, setStatus] = useState<SubmissionStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pending, startTransition] = useTransition();
  const [reloadKey, setReloadKey] = useState(0);

  interface Answer {
    key: string;
    items: PublisherSubmission[];
    total: number;
    failed: boolean;
  }
  const [answer, setAnswer] = useState<Answer | null>(null);

  const queryKey = JSON.stringify([status, page, reloadKey]);
  const current = answer?.key === queryKey ? answer : null;

  const loading = current === null;
  const failed = current?.failed ?? false;
  const total = current?.total ?? 0;
  const rows = useMemo(() => current?.items ?? [], [current]);

  useEffect(() => {
    let live = true;
    publisherSubmissionPageAction({ status, page })
      .then((found) => {
        if (!live) return;
        setAnswer({ key: queryKey, items: found.items, total: found.total, failed: false });
      })
      .catch(() => {
        /*
          An empty list and a failure have to look different. An admin who
          sees "no offers" when the query failed concludes the form is not
          working and goes looking in the wrong place.
        */
        if (!live) return;
        setAnswer({ key: queryKey, items: [], total: 0, failed: true });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const pages = Math.max(1, Math.ceil(total / SUBMISSION_PAGE_SIZE));
  const shown = Math.min(page, pages);
  const paged = {
    rows,
    page: shown,
    pages,
    total,
    from: total === 0 ? 0 : (shown - 1) * SUBMISSION_PAGE_SIZE + 1,
    to: (shown - 1) * SUBMISSION_PAGE_SIZE + rows.length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <label htmlFor="offer-filter" className="sr-only">
            Filter offers by status
          </label>
          <Select
            id="offer-filter"
            size="sm"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as SubmissionStatus | 'all');
              setPage(1);
            }}
          >
            <option value="all">All offers</option>
            {SUBMISSION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {SUBMISSION_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <p className="tabular text-[13px] text-muted" aria-live="polite">
          {failed
            ? 'Could not load the offers.'
            : loading
              ? 'Loading…'
              : `${total} ${total === 1 ? 'offer' : 'offers'}`}
        </p>
      </div>

      <TableWrap>
        <Table>
          <caption className="sr-only">Sites publishers have offered us</caption>
          <thead>
            <tr>
              <Th>Site</Th>
              <Th className="hidden md:table-cell">Asking</Th>
              <Th className="hidden lg:table-cell">Offers</Th>
              <Th className="hidden sm:table-cell">Received</Th>
              <Th className="w-44">Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <Tr>
                <Td colSpan={5} className="py-10 text-center text-[13px] text-muted">
                  {failed
                    ? 'Could not load the offers. Try again, or reload the page.'
                    : loading
                      ? 'Loading offers…'
                      : 'No offers here yet.'}
                </Td>
              </Tr>
            ) : null}

            {rows.map((offer) => (
              <Tr key={offer.id}>
                <Td className="align-top">
                  <div className="flex flex-wrap items-center gap-2">
                    {/*
                      `noreferrer noopener` and nothing else. This is a URL a
                      stranger supplied, so it is opened away from the admin
                      rather than navigated to in it.
                    */}
                    <a
                      href={`https://${offer.domain}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:text-accent-700"
                    >
                      {offer.domain}
                      <ExternalLink className="h-3 w-3 text-muted" aria-hidden="true" />
                    </a>
                    {/*
                      The one fact that changes what this row is. An offer
                      against a site we already carry is a price somebody is
                      changing, not inventory we are gaining.
                    */}
                    {offer.matchedWebsiteId ? (
                      <Badge tone="info">Already listed</Badge>
                    ) : null}
                  </div>

                  <p className="mt-1 text-[13px] text-ink-soft">{offer.fullName}</p>
                  <a
                    href={`mailto:${offer.email}`}
                    className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-accent-700 hover:underline"
                  >
                    <Mail className="h-3 w-3" aria-hidden="true" />
                    {offer.email}
                  </a>

                  {offer.message ? (
                    <p className="mt-2 max-w-xl text-[13px] leading-relaxed whitespace-pre-line text-ink-soft">
                      {offer.message}
                    </p>
                  ) : null}

                  {/* On a phone the metadata columns are hidden, so the two
                      facts worth having come back here as chips. */}
                  <div className="mt-2 flex flex-wrap gap-1.5 md:hidden">
                    <Badge tone="neutral">{priceOf(offer)}</Badge>
                    {offer.placementType ? (
                      <Badge tone="neutral">{offer.placementType}</Badge>
                    ) : null}
                  </div>

                  {offer.handledBy ? (
                    <p className="mt-2 text-[11px] text-muted">
                      {SUBMISSION_STATUS_LABELS[offer.status]} by {offer.handledBy}
                      {offer.handledAt ? ` on ${formatDateTime(offer.handledAt)}` : ''}
                    </p>
                  ) : null}
                </Td>

                <Td className="tabular hidden align-top text-[13px] whitespace-nowrap text-ink-soft md:table-cell">
                  {priceOf(offer)}
                </Td>
                <Td className="hidden align-top text-[13px] text-ink-soft lg:table-cell">
                  {offer.placementType ?? '—'}
                </Td>
                <Td className="tabular hidden align-top text-[13px] whitespace-nowrap text-muted sm:table-cell">
                  {formatDateTime(offer.createdAt)}
                </Td>

                <Td className="align-top">
                  <label htmlFor={`offer-status-${offer.id}`} className="sr-only">
                    Status for the offer of {offer.domain}
                  </label>
                  <Select
                    id={`offer-status-${offer.id}`}
                    size="sm"
                    value={offer.status}
                    disabled={pending}
                    onChange={(event) =>
                      startTransition(async () => {
                        await setPublisherSubmissionStatusAction(offer.id, event.target.value);
                        /*
                          Re-read rather than patch the row here. The page is
                          a filter's worth of offers and a status change can
                          move one out of it; editing the local copy leaves
                          it sitting under a filter it no longer matches.
                        */
                        setReloadKey((key) => key + 1);
                        router.refresh();
                      })
                    }
                  >
                    {SUBMISSION_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {SUBMISSION_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </Select>

                  {/*
                    Delete, under the status rather than beside it.

                    A status is the thing anybody does to one of these, and a
                    delete is the thing nobody undoes - so they are not two
                    controls of equal weight on one line. It confirms by
                    domain, because the rows differ by a line of small text
                    and the one above is somebody's real offer.
                  */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1.5 -ml-2 text-muted hover:text-negative"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        if (
                          !window.confirm(
                            `Delete the offer of ${offer.domain} from ${offer.fullName}? ` +
                              'There is no undo and no copy of it anywhere else.',
                          )
                        ) {
                          return;
                        }
                        await deletePublisherSubmissionAction(offer.id);
                        setReloadKey((key) => key + 1);
                        router.refresh();
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete
                  </Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <Pagination
        paged={paged}
        size={SUBMISSION_PAGE_SIZE}
        noun="offers"
        allowAll={false}
        onPage={setPage}
        onSize={() => {
          // Fixed page size: the rows are tall because each carries a whole
          // message, and "all" here is the unpaged read this avoids.
        }}
      />
    </div>
  );
}

/**
 * What they are asking, or that they did not say.
 *
 * "Not given" rather than a dash or a zero. A publisher who left the price
 * out is one to ask, and a nought in this column is a figure somebody could
 * act on - which is the mistake `planner/summary` has a rule against from
 * the other direction: blank is not zero.
 */
function priceOf(offer: PublisherSubmission): string {
  if (offer.priceMinor == null || !offer.currency) return 'Not given';
  return formatPrice(offer.priceMinor, { currency: offer.currency });
}
