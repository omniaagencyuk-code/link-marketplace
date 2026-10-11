'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { archiveProjectAction, saveProjectAction } from '@/app/dashboard/planner/actions';
import { countries } from '@/lib/data/countries';
import type { PlannerProject } from '@/lib/types/planner';

/**
 * Creating and editing a project.
 *
 * The project is a `gap_projects` row - the same one the Link Gap Finder
 * and the marketplace panel read - so a site added here appears there, and
 * a site added there can be planned against here without being typed twice.
 *
 * Only the domain is required. A customer who knows which site they are
 * working on but has not agreed a budget yet should not be stopped at the
 * first form, and blank is stored as unknown rather than as zero.
 */

const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD'];

export function ProjectDialog({
  open,
  project,
  onClose,
  onSaved,
}: {
  open: boolean;
  project: PlannerProject | null;
  onClose: () => void;
  onSaved: (project: PlannerProject) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    domain: '',
    country: 'gb',
    currency: 'GBP',
    target: '',
    budget: '',
    notes: '',
  });

  /*
    Re-seeded whenever the dialog opens on a different project, so editing
    one and then creating another does not start with the first one's
    values.

    Keyed during render rather than in an effect: the values are known from
    the props at render time, and an effect would paint the previous
    project's details for one frame before replacing them.
  */
  const key = `${open ? 'open' : 'shut'}:${project?.id ?? 'new'}`;
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    setError(null);
    setForm({
      name: project?.name ?? '',
      domain: project?.domain ?? '',
      country: project?.country ?? 'gb',
      currency: project?.currency ?? 'GBP',
      target: project?.monthlyLinkTarget == null ? '' : String(project.monthlyLinkTarget),
      budget:
        project?.monthlyBudgetMinor == null ? '' : String(project.monthlyBudgetMinor / 100),
      notes: project?.notes ?? '',
    });
  }

  const submit = () => {
    startTransition(async () => {
      const result = await saveProjectAction({
        id: project?.id,
        name: form.name,
        domain: form.domain,
        country: form.country,
        currency: form.currency,
        monthlyLinkTarget: form.target === '' ? null : Number(form.target),
        monthlyBudgetMinor: form.budget === '' ? null : Math.round(Number(form.budget) * 100),
        notes: form.notes,
      });
      if ('error' in result && result.error) {
        setError(result.error);
        return;
      }
      if (result.project) onSaved(result.project);
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      mobileOnly={false}
      title={project ? 'Project settings' : 'New project'}
      description="One website you are building links for - your own, or a client's."
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" className="flex-1" onClick={submit} disabled={pending}>
            {pending ? 'Saving...' : project ? 'Save project' : 'Create project'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="project-domain">Website</Label>
          <Input
            id="project-domain"
            value={form.domain}
            onChange={(event) => setForm((f) => ({ ...f, domain: event.target.value }))}
            placeholder="example.com"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            value={form.name}
            onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
            placeholder="UK Sports Betting"
            className="mt-1.5"
          />
          <p className="mt-1 text-[12px] text-muted">
            Left blank, it takes the domain. A client name is usually easier to pick out of a list.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="project-country">Target country</Label>
            <Select
              id="project-country"
              value={form.country}
              onChange={(event) => setForm((f) => ({ ...f, country: event.target.value }))}
              className="mt-1.5"
            >
              {countries.map((country) => (
                <option key={country.code} value={country.code.toLowerCase()}>
                  {country.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="project-currency">Currency</Label>
            <Select
              id="project-currency"
              value={form.currency}
              onChange={(event) => setForm((f) => ({ ...f, currency: event.target.value }))}
              className="mt-1.5"
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="project-target">Monthly link target</Label>
            <Input
              id="project-target"
              type="number"
              min={0}
              value={form.target}
              onChange={(event) => setForm((f) => ({ ...f, target: event.target.value }))}
              placeholder="20"
              className="tabular mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="project-budget">Monthly budget</Label>
            <Input
              id="project-budget"
              type="number"
              min={0}
              step="0.01"
              value={form.budget}
              onChange={(event) => setForm((f) => ({ ...f, budget: event.target.value }))}
              placeholder="5000"
              className="tabular mt-1.5"
            />
          </div>
        </div>
        <p className="text-[12px] leading-relaxed text-muted">
          Both are defaults any month can override. Left blank they stay unset, which is not the
          same as zero: the overview shows counts without a percentage rather than claiming you
          missed a target you never set.
        </p>

        {error ? (
          <p role="alert" className="rounded-lg border border-negative/30 bg-negative/5 px-3 py-2 text-[13px] text-negative">
            {error}
          </p>
        ) : null}

        {project ? (
          <div className="border-t border-line pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Archive "${project.name}"? Its links are kept and it leaves the list.`)) return;
                startTransition(async () => {
                  await archiveProjectAction(project.id);
                  onClose();
                });
              }}
            >
              Archive project
            </Button>
            <p className="mt-1.5 text-[12px] text-muted">
              Archived, not deleted. Every link planned against it is kept.
            </p>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
