'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { saveStatusAction, retireStatusAction } from '@/app/dashboard/planner/actions';
import {
  STATUS_CATEGORIES,
  STATUS_CATEGORY_LABELS,
  type PlannerStatus,
  type StatusCategory,
} from '@/lib/types/planner';

/**
 * Renaming, recolouring, reordering and retiring the customer's statuses.
 *
 * ## Why a status needs a category
 *
 * "Awaiting publisher" is a status the customer invented, and the overview
 * still has to count it as something. Without the category every chart
 * would have to ignore custom statuses, which is to say ignore the ones
 * actually in use - so the category is required when a status is created,
 * rather than being an advanced setting nobody fills in.
 *
 * ## Retire, not delete
 *
 * The button says Remove and the outcome depends on whether the status is
 * on any links. If it is, the database refuses the delete and the status
 * is archived instead: it leaves the dropdown and goes on describing the
 * rows that already carry it. The alternative - deleting the status and
 * letting the rows lose it - is how a planner silently empties a column.
 */
export function ManageStatuses({
  statuses,
  open,
  onClose,
}: {
  statuses: PlannerStatus[];
  open: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; colour: string; category: StatusCategory }>({
    name: '',
    colour: '#64748b',
    category: 'in_progress',
  });

  const live = statuses.filter((status) => !status.archivedAt);
  const archived = statuses.filter((status) => status.archivedAt);

  const add = () => {
    if (!draft.name.trim()) return;
    startTransition(async () => {
      const result = await saveStatusAction({
        name: draft.name,
        colour: draft.colour,
        category: draft.category,
        sortOrder: (live.at(-1)?.sortOrder ?? 0) + 10,
      });
      setNotice('error' in result && result.error ? result.error : null);
      if (!('error' in result && result.error)) {
        setDraft({ name: '', colour: '#64748b', category: 'in_progress' });
      }
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      mobileOnly={false}
      title="Manage statuses"
      description="Your own pipeline. Each one reports as a category, so the overview can count it."
    >
      <div className="space-y-5">
        <ul className="space-y-2">
          {live.map((status) => (
            <li key={status.id} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: status.colour }}
              />
              <Input
                defaultValue={status.name}
                aria-label={`Rename ${status.name}`}
                className="h-8 flex-1 text-[13px]"
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (!name || name === status.name) return;
                  startTransition(async () => {
                    const result = await saveStatusAction({
                      id: status.id,
                      name,
                      colour: status.colour,
                      category: status.category,
                      sortOrder: status.sortOrder,
                    });
                    setNotice('error' in result && result.error ? result.error : null);
                  });
                }}
              />
              <Select
                size="sm"
                defaultValue={status.category}
                aria-label={`What ${status.name} reports as`}
                className="w-36"
                onChange={(event) => {
                  startTransition(async () => {
                    await saveStatusAction({
                      id: status.id,
                      name: status.name,
                      colour: status.colour,
                      category: event.target.value as StatusCategory,
                      sortOrder: status.sortOrder,
                    });
                  });
                }}
              >
                {STATUS_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {STATUS_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
              <input
                type="color"
                defaultValue={status.colour}
                aria-label={`Colour for ${status.name}`}
                className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-line-strong bg-white p-0.5"
                onBlur={(event) => {
                  if (event.target.value === status.colour) return;
                  startTransition(async () => {
                    await saveStatusAction({
                      id: status.id,
                      name: status.name,
                      colour: event.target.value,
                      category: status.category,
                      sortOrder: status.sortOrder,
                    });
                  });
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${status.name}`}
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await retireStatusAction(status.id);
                    setNotice(
                      result.outcome === 'archived'
                        ? `"${status.name}" is on links already, so it was archived rather than deleted. Those links keep it.`
                        : null,
                    );
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>

        {notice ? (
          <p role="status" className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
            {notice}
          </p>
        ) : null}

        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-3">
          <p className="mb-2 text-[12px] font-medium text-ink-soft">Add a status</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={draft.name}
              onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
              placeholder="Waiting for content"
              aria-label="New status name"
              className="h-8 min-w-40 flex-1 text-[13px]"
            />
            <Select
              size="sm"
              value={draft.category}
              aria-label="What it reports as"
              className="w-36"
              onChange={(event) =>
                setDraft((d) => ({ ...d, category: event.target.value as StatusCategory }))
              }
            >
              {STATUS_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {STATUS_CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
            <input
              type="color"
              value={draft.colour}
              aria-label="Its colour"
              onChange={(event) => setDraft((d) => ({ ...d, colour: event.target.value }))}
              className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-line-strong bg-white p-0.5"
            />
            <Button variant="accent" size="sm" onClick={add} disabled={pending || !draft.name.trim()}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add
            </Button>
          </div>
        </div>

        {archived.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted">Archived</p>
            <p className="text-[12px] leading-relaxed text-muted">
              {archived.map((status) => status.name).join(', ')} — still shown on the links that
              carry them, and gone from the dropdown.
            </p>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
