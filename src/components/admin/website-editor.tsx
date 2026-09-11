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

function priceOf(website: Website | undefined, type: LinkTypeSlug) {
  const service = website?.services.find((candidate) => candidate.type === type);
  return service ? service.priceMinor / 100 : '';
}

/**
 * Create/edit form for a marketplace website.
 *
 * Submits to a server action, so it works without client-side JavaScript.
 */
export function WebsiteEditor({ website }: { website?: Website }) {
  const isEdit = Boolean(website);

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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing and turnaround</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Guest post price" htmlFor="guestPostPrice" hint="0 hides the service">
            <Input
              id="guestPostPrice"
              name="guestPostPrice"
              type="number"
              min={0}
              step={5}
              defaultValue={priceOf(website, 'guest-post')}
            />
          </Field>
          <Field label="Niche edit price" htmlFor="nicheEditPrice" hint="0 hides the service">
            <Input
              id="nicheEditPrice"
              name="nicheEditPrice"
              type="number"
              min={0}
              step={5}
              defaultValue={priceOf(website, 'niche-edit')}
            />
          </Field>
          <Field label="Digital PR price" htmlFor="digitalPrPrice" hint="0 hides the service">
            <Input
              id="digitalPrPrice"
              name="digitalPrPrice"
              type="number"
              min={0}
              step={5}
              defaultValue={priceOf(website, 'digital-pr')}
            />
          </Field>
          <Field label="Turnaround min (days)" htmlFor="turnaroundMin">
            <Input
              id="turnaroundMin"
              name="turnaroundMin"
              type="number"
              min={1}
              defaultValue={
                website?.services[0]?.turnaroundMinDays ?? 3
              }
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publishing rules</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum word count" htmlFor="minWordCount">
            <Input
              id="minWordCount"
              name="minWordCount"
              type="number"
              min={0}
              step={50}
              defaultValue={website?.rules.minWordCount ?? 800}
            />
          </Field>
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
        <p className="text-[12px] text-muted">
          Saving writes to the in-memory mock store and resets when the server restarts.
        </p>
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
