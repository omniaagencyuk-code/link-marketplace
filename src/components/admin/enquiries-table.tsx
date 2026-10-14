'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Mail } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { enquiryPageAction, setEnquiryStatusAction } from '@/app/admin/(protected)/enquiries/actions';
import { ENQUIRY_STATUSES, ENQUIRY_STATUS_LABELS, type EnquiryStatus } from '@/lib/enquiries/options';
import { ENQUIRY_PAGE_SIZE, type PricingEnquiry } from '@/lib/enquiries/types';
import { formatDateTime } from '@/lib/utils/format';

/**
 * The pricing enquiries, a page at a time.
 *
 * Paged from the first version rather than when it hurts. This is the one
 * table in the schema a stranger can cause a row in, so it is the one whose
 * size nobody decides - and 0068 recorded what an unpaged admin read does
 * when PostgREST caps the response and says nothing in it.
 *
 * The message is shown in full rather than truncated to a line. It is the
 * whole point of the row: somebody wrote it to be read, and an admin who has
 * to click into each one to find out whether it matters will stop reading
 * them. Four columns of metadata beside it would push it into a sliver, so
 * the layout puts the message under the person rather than next to them.
 */
export function EnquiriesTable() {
  const [status, setStatus] = useState<EnquiryStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pending, startTransition] = useTransition();
  const [reloadKey, setReloadKey] = useState(0);

  interface Answer {
    key: string;
    items: PricingEnquiry[];
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
    enquiryPageAction({ status, page })
      .then((found) => {
        if (!live) return;
        setAnswer({ key: queryKey, items: found.items, total: found.total, failed: false });
      })
      .catch(() => {
        /*
          An empty list and a failure have to look different. An admin who
          sees "no enquiries" when the query failed concludes the form is
          not working and goes looking in the wrong place.
        */
        if (!live) return;
        setAnswer({ key: queryKey, items: [], total: 0, failed: true });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const pages = Math.max(1, Math.ceil(total / ENQUIRY_PAGE_SIZE));
  const shown = Math.min(page, pages);
  const paged = {
    rows,
    page: shown,
    pages,
    total,
    from: total === 0 ? 0 : (shown - 1) * ENQUIRY_PAGE_SIZE + 1,
    to: (shown - 1) * ENQUIRY_PAGE_SIZE + rows.length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <label htmlFor="enquiry-filter" className="sr-only">
            Filter enquiries by status
          </label>
          <Select
            id="enquiry-filter"
            size="sm"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as EnquiryStatus | 'all');
              setPage(1);
            }}
          >
            <option value="all">All enquiries</option>
            {ENQUIRY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ENQUIRY_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <p className="tabular text-[13px] text-muted" aria-live="polite">
          {failed
            ? 'Could not load the enquiries.'
            : loading
              ? 'Loading…'
              : `${total} ${total === 1 ? 'enquiry' : 'enquiries'}`}
        </p>
      </div>

      <TableWrap>
        <Table>
          <caption className="sr-only">Pricing enquiries</caption>
          <thead>
            <tr>
              <Th>Who</Th>
              <Th className="hidden md:table-cell">Budget</Th>
              <Th className="hidden lg:table-cell">Interested in</Th>
              <Th className="hidden sm:table-cell">Received</Th>
              <Th className="w-44">Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <Tr>
                <Td colSpan={5} className="py-10 text-center text-[13px] text-muted">
                  {failed
                    ? 'Could not load the enquiries. Try again, or reload the page.'
                    : loading
                      ? 'Loading enquiries…'
                      : 'No enquiries here yet.'}
                </Td>
              </Tr>
            ) : null}

            {rows.map((enquiry) => (
              <Tr key={enquiry.id}>
                <Td className="align-top">
                  <p className="text-[13px] font-medium text-ink">{enquiry.fullName}</p>
                  {/*
                    A mailto, because replying is the only thing anybody does
                    with one of these and the alternative is selecting the
                    address by hand.
                  */}
                  <a
                    href={`mailto:${enquiry.email}`}
                    className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-accent-700 hover:underline"
                  >
                    <Mail className="h-3 w-3" aria-hidden="true" />
                    {enquiry.email}
                  </a>
                  {enquiry.company ? (
                    <p className="mt-0.5 text-[12px] text-muted">{enquiry.company}</p>
                  ) : null}

                  {/* The message, whole. `whitespace-pre-line` because the
                      paragraphs they typed are kept on the way in. */}
                  <p className="mt-2 max-w-xl text-[13px] leading-relaxed whitespace-pre-line text-ink-soft">
                    {enquiry.message}
                  </p>

                  {/* On a phone the metadata columns are hidden, so the two
                      facts worth having come back here as chips. */}
                  <div className="mt-2 flex flex-wrap gap-1.5 md:hidden">
                    {enquiry.budgetBand ? <Badge tone="neutral">{enquiry.budgetBand}</Badge> : null}
                    {enquiry.interest ? <Badge tone="neutral">{enquiry.interest}</Badge> : null}
                  </div>

                  {enquiry.handledBy ? (
                    <p className="mt-2 text-[11px] text-muted">
                      {ENQUIRY_STATUS_LABELS[enquiry.status]} by {enquiry.handledBy}
                      {enquiry.handledAt ? ` on ${formatDateTime(enquiry.handledAt)}` : ''}
                    </p>
                  ) : null}
                </Td>

                <Td className="hidden align-top text-[13px] whitespace-nowrap text-ink-soft md:table-cell">
                  {enquiry.budgetBand ?? '—'}
                </Td>
                <Td className="hidden align-top text-[13px] text-ink-soft lg:table-cell">
                  {enquiry.interest ?? '—'}
                </Td>
                <Td className="tabular hidden align-top text-[13px] whitespace-nowrap text-muted sm:table-cell">
                  {formatDateTime(enquiry.createdAt)}
                  {enquiry.source !== 'pricing-page' ? (
                    <span className="mt-0.5 block text-[11px] text-muted-soft">
                      {enquiry.source}
                    </span>
                  ) : null}
                </Td>

                <Td className="align-top">
                  <label htmlFor={`status-${enquiry.id}`} className="sr-only">
                    Status for the enquiry from {enquiry.fullName}
                  </label>
                  <Select
                    id={`status-${enquiry.id}`}
                    size="sm"
                    value={enquiry.status}
                    disabled={pending}
                    onChange={(event) =>
                      startTransition(async () => {
                        await setEnquiryStatusAction(enquiry.id, event.target.value);
                        /*
                          Re-read rather than patch the row here. The page is
                          a filter's worth of enquiries and a status change
                          can move one out of it; editing the local copy
                          leaves it sitting under a filter it no longer
                          matches.
                        */
                        setReloadKey((key) => key + 1);
                      })
                    }
                  >
                    {ENQUIRY_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {ENQUIRY_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <Pagination
        paged={paged}
        size={ENQUIRY_PAGE_SIZE}
        noun="enquiries"
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
