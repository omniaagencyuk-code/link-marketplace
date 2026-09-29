'use client';

import { useMemo, useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { acceptSuggestionsAction } from '@/app/admin/(protected)/majestic/actions';
import { chunk } from '@/lib/utils/chunk';
import type { MajesticSuggestion } from '@/lib/services/majestic-service';

/**
 * Categories the topics suggest, for a human to accept or ignore.
 *
 * Never applied automatically, and the reason is worth stating where somebody
 * will read it: a Topical Trust Flow topic describes who links to a site, not
 * what it publishes. Of 910 domains in a real export, 38 led with a gambling
 * topic - against the hundreds whose publishers have written to us saying
 * they will run gambling content. Letting this set the category would move
 * listings into filters their buyers did not ask for.
 *
 * The evidence sits in the row - the topic and its value - so accepting one is
 * a judgement rather than a leap of faith.
 */
export function MajesticSuggestions({ suggestions }: { suggestions: MajesticSuggestion[] }) {
  const [busy, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  /*
    Listings with no category at all come first.

    Nine hundred were created by the publisher inbox and carry whatever the
    importer defaulted to, so for most of these the choice is not "is this
    better?" but "is any category better than none?".
  */
  const rows = useMemo(
    () => [...suggestions].sort((a, b) => Number(Boolean(a.current)) - Number(Boolean(b.current))),
    [suggestions],
  );

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function accept() {
    const chosen = rows.filter((row) => selected.has(row.websiteId));
    if (chosen.length === 0) return;

    startTransition(async () => {
      let changed = 0;
      for (const part of chunk(chosen, 100)) {
        const outcome = await acceptSuggestionsAction(
          part.map((row) => ({
            websiteId: row.websiteId,
            niche: row.suggested,
            secondary: row.secondary,
            existingSecondary: row.existingSecondary,
          })),
        );
        changed += outcome.changed;
      }
      setSelected(new Set());
      setMessage(`${changed} ${changed === 1 ? 'listing' : 'listings'} recategorised.`);
    });
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Category suggestions</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-[13px] text-muted">
          Nothing to suggest. Either no listing has Majestic topics yet, or every one that does is
          already in the category its topics point at.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>
          Category suggestions
          <span className="ml-2 text-[13px] font-normal text-muted">{rows.length} listings</span>
        </CardTitle>
        {selected.size > 0 ? (
          <Button variant="accent" size="sm" disabled={busy} onClick={accept}>
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Accept {selected.size}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[12px] leading-relaxed text-muted">
          A Majestic topic describes who links to a site, not what it publishes - so these are
          suggestions, never applied on their own. What a publisher will take is a separate thing
          and comes from their own email.
        </p>

        {message ? (
          <p role="status" className="text-[13px] text-ink-soft">
            {message}
          </p>
        ) : null}

        <TableWrap>
          <Table>
            <caption className="sr-only">Suggested categories from Majestic topics</caption>
            <thead>
              <tr>
                <Th className="w-10">
                  <Checkbox
                    aria-label={allSelected ? 'Clear selection' : 'Select every suggestion'}
                    checked={allSelected}
                    indeterminate={selected.size > 0 && !allSelected}
                    onChange={() =>
                      setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.websiteId)))
                    }
                  />
                </Th>
                <Th>Domain</Th>
                <Th>Now</Th>
                <Th>Suggested</Th>
                <Th>From</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.websiteId}>
                  <Td>
                    <Checkbox
                      aria-label={`Accept ${row.suggestedName} for ${row.domain}`}
                      checked={selected.has(row.websiteId)}
                      onChange={() => toggle(row.websiteId)}
                    />
                  </Td>
                  <Td className="text-[13px] font-medium text-ink">{row.domain}</Td>
                  <Td className="text-[13px] text-muted">{row.currentName ?? 'None'}</Td>
                  <Td className="text-[13px] text-ink">
                    {/* Unchanged where it is already right: the row is here
                        for its secondary niches, and saying so beats printing
                        the same category twice. */}
                    {row.suggested === row.current ? (
                      <span className="text-muted">unchanged</span>
                    ) : (
                      row.suggestedName
                    )}
                    {row.secondaryNames.length > 0 ? (
                      <span className="block text-[11px] text-muted">
                        + {row.secondaryNames.join(', ')}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-[12px] text-muted">
                    {row.from}
                    <span className="tabular ml-1.5 text-ink-soft">{row.value}</span>
                    {row.topics.length > 1 ? (
                      <span className="block text-[11px] text-muted">
                        also {row.topics.slice(1).map((topic) => topic.topic).join(', ')}
                      </span>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </CardContent>
    </Card>
  );
}
