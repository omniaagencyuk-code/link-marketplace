'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { countries } from '@/lib/data/countries';
import type { Suggestion } from '@/lib/gap/competitors';
import type { GapProject } from '@/lib/services/gap-service';
import {
  deleteProjectAction,
  runGapAction,
  saveProjectAction,
  suggestCompetitorsAction,
} from '@/app/dashboard/link-gap/actions';

/**
 * The form that spends money.
 *
 * Three things it does on purpose.
 *
 * **It says how many reports are left before anybody fills it in**, and
 * disables itself at zero. Finding out you have none left at the point of
 * submitting is the version that wastes an afternoon.
 *
 * **It shows whatever the server said when a run is refused, verbatim.** Those
 * messages are written to tell a customer what they can do - wait for the month
 * to turn, or come back later - and replacing them with "something went wrong"
 * turns a solvable situation into a support email.
 *
 * **Suggested competitors arrive as suggestions, not as a run.** The lookup
 * costs fifty units; the report costs 2,500 a target. So the cheap step fills
 * the boxes and stops, and the person reads what came back before the expensive
 * one starts. An agency setting up a client they do not know yet gets a
 * starting point; nobody gets a bill for a list they never saw.
 */
export function GapForm({
  maxCompetitors,
  reportsLeft,
  allowance,
  projects,
}: {
  maxCompetitors: number;
  reportsLeft: number;
  allowance: number;
  projects: GapProject[];
}) {
  const boxes = Math.min(3, Math.max(1, maxCompetitors));

  const [pending, startTransition] = useTransition();
  const [suggesting, startSuggesting] = useTransition();
  const [saving, startSaving] = useTransition();

  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [country, setCountry] = useState('gb');
  const [competitors, setCompetitors] = useState<string[]>(Array.from({ length: boxes }, () => ''));

  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const none = allowance > 0 && reportsLeft === 0;
  const busy = pending || suggesting || saving;

  /** Everything the three actions post. One shape, so they cannot disagree. */
  const fields = () => {
    const data = new FormData();
    data.set('projectId', projectId);
    data.set('name', name);
    data.set('target', target);
    data.set('country', country);
    competitors.forEach((value, index) => data.set(`competitor${index + 1}`, value));
    return data;
  };

  const setCompetitor = (index: number, value: string) =>
    setCompetitors((current) => current.map((entry, at) => (at === index ? value : entry)));

  /**
   * Loading a saved site replaces the form, suggestions included.
   *
   * The suggestions on screen were for the previous domain. Leaving them up
   * while the boxes change is how somebody ends up running a report on one
   * client against another client's rivals.
   */
  const load = (id: string) => {
    setProjectId(id);
    setSuggestions(null);
    setError(null);
    setSaved(null);

    if (!id) {
      setName('');
      setTarget('');
      setCountry('gb');
      setCompetitors(Array.from({ length: boxes }, () => ''));
      return;
    }

    const project = projects.find((entry) => entry.id === id);
    if (!project) return;

    setName(project.name);
    setTarget(project.domain);
    setCountry(project.country);
    setCompetitors(
      Array.from({ length: boxes }, (_, index) => project.competitorDomains[index] ?? ''),
    );
  };

  /**
   * Put a suggestion in the first empty box.
   *
   * And nothing else. The version that overwrote the last box once they were
   * all full made a fourth click silently delete the third choice - the
   * browser check caught it doing exactly that. A person who has filled every
   * box and clicks again has made a choice they cannot see the result of,
   * which is worse than a button that will not move: the chips go flat
   * instead, and the line underneath says why.
   */
  const addCompetitor = (domain: string) => {
    setCompetitors((current) => {
      if (current.includes(domain)) return current;
      const empty = current.findIndex((entry) => !entry.trim());
      if (empty === -1) return current;
      return current.map((entry, index) => (index === empty ? domain : entry));
    });
  };

  const boxesFull = competitors.every((entry) => entry.trim().length > 0);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSaved(null);
        startTransition(async () => {
          // A successful run redirects, so only a refusal returns here.
          const outcome = await runGapAction(fields());
          if (outcome && !outcome.ok) setError(outcome.error ?? 'That could not be run.');
        });
      }}
    >
      {projects.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-end gap-3 border-b border-line pb-5">
          <div className="min-w-[240px] flex-1">
            <Label htmlFor="savedSite">Saved sites</Label>
            <div className="mt-1.5">
              <Select
                id="savedSite"
                value={projectId}
                onChange={(event) => load(event.target.value)}
                disabled={busy}
              >
                <option value="">New report</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} ({project.domain})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {projectId ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                const id = projectId;
                startSaving(async () => {
                  const outcome = await deleteProjectAction(id);
                  if (outcome.ok) load('');
                  else setError(outcome.error ?? 'Could not remove that site.');
                });
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <Label htmlFor="target">Your domain</Label>
            <div className="mt-1.5">
              <Input
                id="target"
                name="target"
                placeholder="yoursite.com"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                disabled={none}
                required
              />
            </div>
            <p className="mt-1.5 text-[12px] text-muted">
              The site you want more links to — yours, or a client&rsquo;s.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Name it (optional)</Label>
              <div className="mt-1.5">
                <Input
                  id="name"
                  name="name"
                  placeholder="Acme Ltd"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={none}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="country">Market</Label>
              <div className="mt-1.5">
                <Select
                  id="country"
                  name="country"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  disabled={none}
                >
                  {countries.map((entry) => (
                    <option key={entry.code} value={entry.code.toLowerCase()}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                Where you want to rank. It changes who counts as a rival.
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between gap-3">
            <Label htmlFor="competitor1">Competitors</Label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={none || busy || !target.trim()}
              onClick={() => {
                setError(null);
                setSaved(null);
                startSuggesting(async () => {
                  const outcome = await suggestCompetitorsAction(fields());
                  if (!outcome.ok) {
                    setSuggestions(null);
                    setError(outcome.error ?? 'Could not suggest competitors.');
                    return;
                  }
                  setSuggestions(outcome.suggestions ?? []);
                  setFromCache(Boolean(outcome.cached));
                });
              }}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {suggesting ? 'Looking...' : 'Suggest'}
            </Button>
          </div>

          <div className="mt-1.5 space-y-2">
            {competitors.map((value, index) => (
              <Input
                key={index}
                id={index === 0 ? 'competitor1' : undefined}
                name={`competitor${index + 1}`}
                placeholder={index === 0 ? 'competitor.com' : 'another-competitor.com (optional)'}
                value={value}
                onChange={(event) => setCompetitor(index, event.target.value)}
                disabled={none}
                required={index === 0}
              />
            ))}
          </div>

          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            Sites ranking for what you want to rank for. The closer they are to you, the more
            useful the gap.
          </p>

          {suggestions ? (
            <div className="mt-3 rounded-lg border border-line bg-surface-sunken p-3">
              {suggestions.length === 0 ? (
                <p className="text-[12px] leading-relaxed text-muted">
                  We could not find clear rivals for that domain in this market. Add them by hand
                  — you will know them better than we do.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-[12px] leading-relaxed text-muted">
                    {boxesFull
                      ? 'All your competitor boxes are full. Clear one to swap a suggestion in.'
                      : 'Ranking for the same searches, closest first. Tap one to add it, then check the boxes before you run anything.'}
                    {fromCache ? ' Looked up earlier, so this cost nothing.' : ''}
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {suggestions.map((entry) => {
                      const chosen = competitors.includes(entry.domain);
                      return (
                        <li key={entry.domain}>
                          <button
                            type="button"
                            onClick={() => addCompetitor(entry.domain)}
                            disabled={chosen || boxesFull || none}
                            className="flex items-center gap-1.5 rounded-full border border-line-strong bg-white px-2.5 py-1 text-[12px] font-medium text-ink transition-colors hover:border-accent-500 disabled:cursor-default disabled:opacity-50"
                          >
                            {chosen ? null : <Plus className="h-3 w-3" aria-hidden="true" />}
                            {entry.domain}
                            <Badge tone="neutral">DR {entry.domainRating}</Badge>
                            <span className="text-muted">
                              {entry.keywordsCommon.toLocaleString('en-GB')} shared
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy || none}>
          {pending ? 'Looking...' : 'Find the gap'}
        </Button>

        <Button
          type="button"
          variant="secondary"
          disabled={busy || none || !target.trim()}
          onClick={() => {
            setError(null);
            setSaved(null);
            startSaving(async () => {
              const outcome = await saveProjectAction(fields());
              if (outcome.ok) setSaved('Saved. It will be in the list next time.');
              else setError(outcome.error ?? 'Could not save that site.');
            });
          }}
        >
          {saving ? 'Saving...' : projectId ? 'Save changes' : 'Save this site'}
        </Button>

        {allowance > 0 ? (
          <p className="text-[12px] text-muted">
            {none
              ? `You have used all ${allowance} of this month's reports. More become available when the month turns.`
              : `${reportsLeft} of ${allowance} reports left this month.`}
          </p>
        ) : null}
      </div>

      {saved ? <p className="mt-3 text-[13px] text-muted">{saved}</p> : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 flex gap-2 rounded-lg border border-coral-300 bg-coral-50 p-3 text-[13px] leading-relaxed text-coral-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </form>
  );
}
