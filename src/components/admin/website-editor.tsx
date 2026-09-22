'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { saveWebsiteAction } from '@/app/admin/actions';
import { categories } from '@/lib/data/categories';
import { countries } from '@/lib/data/countries';
import { languageLabels } from '@/lib/utils/labels';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { AcceptedNichesPicker } from './accepted-niches-picker';
import { WebsiteNichePricesEditor } from './website-niche-prices-editor';
import {
  SERVICE_TYPES,
  WebsiteServicesEditor,
  needsWordCount,
} from './website-services-editor';
import type { LinkTypeSlug, Website } from '@/lib/types';

const statuses = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
];

const sponsoredOptions = [
  { value: 'never', label: 'Never applied' },
  { value: 'on-request', label: 'Only on request' },
  { value: 'always', label: 'Always applied' },
];

/**
 * Create/edit form for a marketplace website.
 *
 * Interactive rather than a plain server-rendered form, because which fields
 * are relevant depends on what the website sells: a publisher offering only
 * niche edits has no article to write, so asking for a word count is asking
 * about something that does not exist. The services picker drives that, and
 * the fields it governs are not rendered at all rather than disabled - a
 * disabled field still reads as a thing you are failing to fill in.
 */
export function WebsiteEditor({
  website,
  currency = 'GBP',
}: {
  website?: Website;
  currency?: string;
}) {
  const isEdit = Boolean(website);

  const [selectedTypes, setSelectedTypes] = useState<Set<LinkTypeSlug>>(() => {
    // An existing website offers whatever it has services for. A new one
    // starts with the guest post ticked, which is what most listings sell.
    if (website) return new Set(website.services.map((service) => service.type));
    return new Set<LinkTypeSlug>(['guest-post']);
  });

  // Mirrored here so the price grid can show a row per ticked niche. The
  // picker still owns the selection and still submits it.
  const [acceptedNiches, setAcceptedNiches] = useState<string[]>(
    () => website?.rules.acceptedNiches ?? [],
  );

  function toggleType(type: LinkTypeSlug, on: boolean) {
    setSelectedTypes((current) => {
      const next = new Set(current);
      if (on) next.add(type);
      else next.delete(type);
      return next;
    });
  }

  const showWordCount = needsWordCount(selectedTypes);
  const writingTypes = SERVICE_TYPES.filter(
    (entry) => entry.writes && selectedTypes.has(entry.type),
  );

  return (
    <form action={saveWebsiteAction} className="space-y-4">
      {website ? <input type="hidden" name="id" value={website.id} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Website details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Domain" htmlFor="domain" required>
            <Input
              id="domain"
              name="domain"
              required
              defaultValue={website?.domain}
              placeholder="example.co.uk"
            />
          </Field>
          <Field label="Website title" htmlFor="title">
            <Input id="title" name="title" defaultValue={website?.title} />
          </Field>
          <Field label="Description" htmlFor="description" className="sm:col-span-2">
            <Input
              id="description"
              name="description"
              defaultValue={website?.description}
              placeholder="One line shown under the domain in the marketplace"
            />
          </Field>
          <Field label="Editorial overview" htmlFor="overview" className="sm:col-span-2">
            <Textarea
              id="overview"
              name="overview"
              defaultValue={website?.overview}
              className="min-h-32"
            />
          </Field>
          <Field label="Niche" htmlFor="niche">
            <Select id="niche" name="niche" defaultValue={website?.niche}>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Secondary niches" htmlFor="secondaryNiches" hint="Comma separated slugs">
            <Input
              id="secondaryNiches"
              name="secondaryNiches"
              defaultValue={website?.secondaryNiches.join(', ')}
              placeholder="finance, business"
            />
          </Field>
          <Field label="Country" htmlFor="country">
            <Select id="country" name="country" defaultValue={website?.country}>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Language" htmlFor="language">
            <Select id="language" name="language" defaultValue={website?.language}>
              {Object.entries(languageLabels).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metrics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Domain rating" htmlFor="domainRating">
            <Input
              id="domainRating"
              name="domainRating"
              type="number"
              min={0}
              max={100}
              defaultValue={website?.metrics.domainRating}
            />
          </Field>
          <Field label="Organic traffic" htmlFor="organicTraffic">
            <Input
              id="organicTraffic"
              name="organicTraffic"
              type="number"
              min={0}
              defaultValue={website?.metrics.organicTraffic}
            />
          </Field>
          <Field label="Referring domains" htmlFor="referringDomains">
            <Input
              id="referringDomains"
              name="referringDomains"
              type="number"
              min={0}
              defaultValue={website?.metrics.referringDomains}
            />
          </Field>

          <Field
            label="Audience in primary country (%)"
            htmlFor="topCountryShare"
            hint="Leave blank if unknown. Blank shows as unknown; 0 would be published as a fact."
          >
            <Input
              id="topCountryShare"
              name="topCountryShare"
              type="number"
              min={0}
              max={100}
              placeholder="Not recorded"
              defaultValue={website?.metrics.topCountryShare ?? ''}
            />
          </Field>
          <Field
            label="6 month traffic change (%)"
            htmlFor="trafficChangePct"
            hint="Negative for a decline, e.g. -12. Blank if you do not have it."
          >
            <Input
              id="trafficChangePct"
              name="trafficChangePct"
              type="number"
              step={0.1}
              placeholder="Not recorded"
              defaultValue={website?.metrics.trafficChangePct ?? ''}
            />
          </Field>
          <Field
            label="Spam score (%)"
            htmlFor="spamScore"
            hint="Blank if unmeasured. Zero is a real score and will be shown."
          >
            <Input
              id="spamScore"
              name="spamScore"
              type="number"
              min={0}
              max={100}
              placeholder="Not recorded"
              defaultValue={website?.metrics.spamScore ?? ''}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What this website sells</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <WebsiteServicesEditor
            website={website}
            selected={selectedTypes}
            onToggle={toggleType}
            currency={currency}
          />

          <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
            <Field label="Turnaround min (days)" htmlFor="turnaroundMin">
              <Input
                id="turnaroundMin"
                name="turnaroundMin"
                type="number"
                min={1}
                defaultValue={website?.services[0]?.turnaroundMinDays ?? 3}
              />
            </Field>
            <Field label="Turnaround max (days)" htmlFor="turnaroundMax">
              <Input
                id="turnaroundMax"
                name="turnaroundMax"
                type="number"
                min={1}
                defaultValue={website?.services[0]?.turnaroundMaxDays ?? 5}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accepted niches</CardTitle>
        </CardHeader>
        <CardContent>
          <AcceptedNichesPicker
            selected={website?.rules.acceptedNiches ?? []}
            onChange={setAcceptedNiches}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing by niche</CardTitle>
        </CardHeader>
        <CardContent>
          <WebsiteNichePricesEditor
            website={website}
            niches={acceptedNiches}
            types={selectedTypes}
            currency={currency}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publishing rules</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {showWordCount ? (
            <Field
              label="Minimum word count"
              htmlFor="minWordCount"
              hint={`Applies to the ${writingTypes
                .map((entry) => entry.label.toLowerCase())
                .join(' and ')} article.`}
            >
              <Input
                id="minWordCount"
                name="minWordCount"
                type="number"
                min={0}
                step={50}
                defaultValue={website?.rules.minWordCount ?? 800}
              />
            </Field>
          ) : (
            // Not rendered rather than disabled: a niche edit places a link in
            // an article that already exists, so there is no word count to
            // give. Leaving a greyed-out box implies one is missing.
            <div className="rounded-lg border border-line bg-surface p-4 text-[12px] leading-relaxed text-muted">
              No word count needed. Niche edits place a link in an article the publisher has
              already written. Tick guest post or digital PR to set one.
            </div>
          )}
          <Field label="Maximum links" htmlFor="maxLinks">
            <Input
              id="maxLinks"
              name="maxLinks"
              type="number"
              min={1}
              defaultValue={website?.rules.maxLinks ?? 1}
            />
          </Field>
          <Field label="Sponsored tag" htmlFor="sponsoredTag">
            <Select id="sponsoredTag" name="sponsoredTag" defaultValue={website?.rules.sponsoredTag}>
              {sponsoredOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Restricted niches"
            htmlFor="restrictedNiches"
            hint="Comma separated, shown on the listing"
          >
            <Input
              id="restrictedNiches"
              name="restrictedNiches"
              defaultValue={website?.rules.restrictedNiches.join(', ')}
            />
          </Field>

          <div className="flex items-center gap-2.5">
            <Checkbox
              id="dofollow"
              name="dofollow"
              defaultChecked={website ? website.rules.linkAttribute === 'dofollow' : true}
            />
            <label htmlFor="dofollow" className="text-[13px] text-ink-soft">
              Dofollow links
            </label>
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox id="verified" name="verified" defaultChecked={website?.verified ?? false} />
            <label htmlFor="verified" className="text-[13px] text-ink-soft">
              Vetted by the editorial team
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="sm:max-w-64">
          <Field label="Listing status" htmlFor="status">
            <Select id="status" name="status" defaultValue={website?.status ?? 'draft'}>
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" size="lg">
          {isEdit ? 'Save changes' : 'Create website'}
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/admin/websites">Cancel</Link>
        </Button>
        {isSupabaseEnabled() ? null : (
          <p className="text-[12px] text-muted">
            Saving writes to the in-memory mock store and resets when the server restarts.
          </p>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-negative">*</span> : null}
      </Label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}
