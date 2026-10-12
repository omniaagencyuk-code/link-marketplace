'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Download,
  Plus,
  Search,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { LinkTable } from './link-table';
import { ProjectDialog } from './project-dialog';
import { ImportSheet } from './import-sheet';
import { PlannerOverview } from './overview';
import { addLinkAction, exportMonthAction, saveMonthAction } from '@/app/dashboard/planner/actions';
import { monthLabel, shiftMonth } from '@/lib/planner/domain-key';
import { linksToCsv } from '@/lib/planner/csv';
import { downloadCsv } from '@/lib/import/csv';
import type {
  MonthSettings,
  PlannerLink,
  PlannerProject,
  PlannerStatus,
} from '@/lib/types/planner';
import type { MonthSummary } from '@/lib/planner/summary';

/**
 * The planner, around its table.
 *
 * The month is the organising idea. A link belongs to a project and a
 * planning month, and switching months is the main thing somebody does
 * here - so it is two arrows and a label rather than a dropdown of
 * twenty-four options, and it never changes what a link's status is.
 *
 * ## What is not here yet
 *
 * The Overview and Reports tabs, the charts, CSV, filters and the Press
 * Parrot metric lookup. Those are later stages and drawing an empty tab for
 * them now would be worse than leaving them out.
 */
export function PlannerView({
  projects,
  project,
  month,
  monthSettings,
  links,
  total,
  statuses,
  sources,
  summary,
}: {
  projects: PlannerProject[];
  project: PlannerProject | null;
  month: string;
  monthSettings: MonthSettings | null;
  links: PlannerLink[];
  total: number;
  statuses: PlannerStatus[];
  sources: string[];
  summary: MonthSummary | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newDomain, setNewDomain] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<PlannerProject | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [importing, setImporting] = useState(false);

  const go = (next: { project?: string; month?: string }) => {
    const params = new URLSearchParams();
    params.set('project', next.project ?? project?.id ?? '');
    params.set('month', next.month ?? month);
    router.push(`/dashboard/planner?${params.toString()}`);
  };

  const refresh = () => router.refresh();

  const addLink = () => {
    if (!project || !newDomain.trim()) return;
    const firstStatus = statuses.find((status) => !status.archivedAt);
    if (!firstStatus) return;

    startTransition(async () => {
      const result = await addLinkAction(project.id, month, firstStatus.id, newDomain);
      if ('error' in result && result.error) {
        setAddError(result.error);
        return;
      }
      setAddError(null);
      setNewDomain('');
      refresh();
    });
  };

  if (!project) {
    return (
      <>
        <EmptyState
          icon={FolderPlus}
          title="Start with a project"
          description="A project is one website you are building links for - your own or a client's. Add one and you can start planning links against it."
          action={
            <Button variant="accent" onClick={() => setCreatingProject(true)}>
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              New project
            </Button>
          }
        />
        <ProjectDialog
          open={creatingProject}
          project={null}
          onClose={() => setCreatingProject(false)}
          onSaved={(saved) => {
            setCreatingProject(false);
            go({ project: saved.id });
          }}
        />
      </>
    );
  }

  const target = monthSettings?.linkTarget ?? null;
  const budget = monthSettings?.budgetMinor ?? null;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------- the project bar */}
      <div className="flex flex-wrap items-stretch gap-3 rounded-[var(--radius-card)] border border-line bg-white p-3 shadow-[var(--shadow-card)]">
        <label className="min-w-56 flex-1">
          <span className="sr-only">Project</span>
          <Select
            value={project.id}
            onChange={(event) => go({ project: event.target.value })}
            aria-label="Project"
          >
            {projects.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} · {option.domain}
              </option>
            ))}
          </Select>
        </label>

        <div className="flex items-center gap-1 rounded-md border border-line-strong px-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() => go({ month: shiftMonth(month, -1) })}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="flex min-w-36 items-center justify-center gap-1.5 text-[13px] font-medium text-ink">
            <CalendarRange className="h-3.5 w-3.5 text-accent-600" aria-hidden="true" />
            {monthLabel(month)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next month"
            onClick={() => go({ month: shiftMonth(month, 1) })}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/*
          Target and budget for this month, editable where they are shown.
          Writing one creates an override for this month only - the project's
          default stays what it was, which is what lets December be a bigger
          month than the rest without rewriting the project.
        */}
        <MonthField
          label="Target links"
          value={target === null ? '' : String(target)}
          placeholder="—"
          onSave={(value) =>
            saveMonthAction(project.id, month, {
              linkTarget: value === '' ? null : Number(value),
              budgetMinor: budget,
            })
          }
        />
        <MonthField
          label={`Budget (${project.currency})`}
          value={budget === null ? '' : String(budget / 100)}
          placeholder="—"
          onSave={(value) =>
            saveMonthAction(project.id, month, {
              linkTarget: target,
              budgetMinor: value === '' ? null : Math.round(Number(value) * 100),
            })
          }
        />

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditingProject(project)}>
            Project settings
          </Button>
          <Button variant="accent" size="sm" onClick={() => setCreatingProject(true)}>
            <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
            New project
          </Button>
        </div>
      </div>

      {monthSettings?.fromProjectDefaults && (target !== null || budget !== null) ? (
        <p className="text-[12px] text-muted">
          Showing this project&rsquo;s defaults. Changing either figure sets it for{' '}
          {monthLabel(month)} only.
        </p>
      ) : null}

      {summary ? (
        <PlannerOverview summary={summary} currency={project.currency} monthName={monthLabel(month)} />
      ) : null}

      {/* -------------------------------------------------- add, and count */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Input
              value={newDomain}
              onChange={(event) => setNewDomain(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addLink();
              }}
              placeholder="Add a domain..."
              aria-label="Domain to add to this month"
              className="h-9 w-56"
            />
          </div>
          <Button variant="accent" size="sm" onClick={addLink} disabled={pending || !newDomain.trim()}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add link
          </Button>
          {addError ? (
            <span role="alert" className="text-[12px] text-negative">
              {addError}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Import CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={total === 0 || pending}
            onClick={() => {
              /* Exported from the server rather than from the fifty rows on
                 screen: a file that quietly stops at the page boundary is
                 worse than no export at all. */
              startTransition(async () => {
                const { links: all, statuses: every } = await exportMonthAction(project.id, month);
                downloadCsv(
                  `press-parrot-planner-${project.domain}-${month.slice(0, 7)}.csv`,
                  linksToCsv(all, every),
                );
              });
            }}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/marketplace">
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Find publishers
            </Link>
          </Button>
          <p className="tabular text-[13px] text-muted">
            <span className="font-semibold text-ink">{total}</span>{' '}
            {total === 1 ? 'link' : 'links'} in {monthLabel(month)}
          </p>
        </div>
      </div>

      {links.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={`No links planned for ${monthLabel(month)}`}
          description="Add your first domain above. Everything else - metrics, anchor, status, price and dates - is editable in the table once the row exists."
        />
      ) : (
        <LinkTable
          links={links}
          statuses={statuses}
          sources={sources}
          currency={project.currency}
          onChanged={refresh}
        />
      )}

      {/* The mockup's second promotional card was link monitoring. There is
          no monitoring here and there is not going to be, so the space goes
          to the two things that are free and real. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Promo
          icon={Upload}
          title="Import your existing links"
          body="Move your link-building spreadsheet into Press Parrot in minutes."
          action={
            <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
              Import CSV
            </Button>
          }
        />
        <Promo
          icon={Search}
          title="Find publisher opportunities"
          body="Search the marketplace for your next placement and plan it here."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/marketplace">Browse marketplace</Link>
            </Button>
          }
        />
      </div>

      <ImportSheet
        open={importing}
        projectId={project.id}
        month={month}
        onClose={() => setImporting(false)}
        onImported={refresh}
      />

      <ProjectDialog
        open={creatingProject || editingProject !== null}
        project={editingProject}
        onClose={() => {
          setCreatingProject(false);
          setEditingProject(null);
        }}
        onSaved={(saved) => {
          setCreatingProject(false);
          setEditingProject(null);
          go({ project: saved.id });
        }}
      />
    </div>
  );
}

/** A month figure, saved when the field is left. */
function MonthField({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  placeholder: string;
  onSave: (value: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(value);
  const [, startTransition] = useTransition();
  const router = useRouter();

  // The server's figure wins when it changes under us - switching month or
  // project re-renders this with a new `value`, and the draft has to follow.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }

  return (
    <label className="min-w-28">
      <span className="mb-0.5 block text-[11px] text-muted">{label}</span>
      <Input
        value={draft}
        type="number"
        min={0}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft === value) return;
          startTransition(async () => {
            await onSave(draft);
            router.refresh();
          });
        }}
        className="tabular h-9"
      />
    </label>
  );
}

function Promo({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Search;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{body}</p>
        {action ? <div className="mt-2.5">{action}</div> : null}
      </div>
    </div>
  );
}
