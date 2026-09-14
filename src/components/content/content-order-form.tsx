'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useContentDraft } from '@/lib/providers/content-draft-provider';
import {
  contentLanguages,
  contentTones,
  contentTypes,
  wordCountOptions,
} from '@/lib/config/content';
import { isPricingConfigured, priceForWords } from '@/lib/services/content-pricing';
import { formatPrice } from '@/lib/utils/format';
import type { ContentBrief, ContentPricing, ContentTypeSlug } from '@/lib/types/content';
import type { Country } from '@/lib/types';

/**
 * The content brief form.
 *
 * "Add to Order" pushes a brief into the basket rather than submitting, so a
 * customer can queue several articles - three 1,000 word pieces, say - and
 * check out once. The price shown here is indicative; the server recalculates
 * it from the same configuration at checkout.
 */
export function ContentOrderForm({
  pricing,
  countries,
}: {
  pricing: ContentPricing;
  countries: Country[];
}) {
  const { add } = useContentDraft();
  const [contentType, setContentType] = useState<ContentTypeSlug>('seo-article');
  const [wordCount, setWordCount] = useState<string>('1000');
  const [customWords, setCustomWords] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const resolvedWords = wordCount === 'custom' ? Number(customWords) || 0 : Number(wordCount);
  const configured = isPricingConfigured(pricing);
  const unitPrice = useMemo(
    () => (configured ? priceForWords(pricing, resolvedWords, contentType) : null),
    [configured, pricing, resolvedWords, contentType],
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const read = (name: string) => String(data.get(name) ?? '').trim();
    const list = (name: string) =>
      read(name)
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean);

    const brief: ContentBrief = {
      brand: read('brand'),
      topic: read('topic'),
      suggestedTitle: read('suggestedTitle') || undefined,
      targetKeyword: read('targetKeyword'),
      secondaryKeywords: list('secondaryKeywords'),
      targetUrl: read('targetUrl') || undefined,
      anchorText: read('anchorText') || undefined,
      wordCount: resolvedWords,
      contentType,
      country: read('country') || undefined,
      language: (read('language') || 'en-GB') as ContentBrief['language'],
      tone: (read('tone') || 'professional') as ContentBrief['tone'],
      audience: read('audience') || undefined,
      references: list('references'),
      instructions: read('instructions') || undefined,
    };

    const file = data.get('briefFile');
    if (file instanceof File && file.size > 0) {
      brief.briefFileName = file.name;
      brief.briefFileSize = file.size;
    }

    add(brief, quantity);
    setAdded(
      `${quantity} × ${resolvedWords.toLocaleString('en-GB')} word ${
        contentTypes.find((type) => type.slug === contentType)?.label ?? 'article'
      } added to your order.`,
    );
    // Remount the uncontrolled fields so the next brief starts clean.
    setFormKey((value) => value + 1);
    setQuantity(1);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <form key={formKey} onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>What are we writing?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="brand" label="Website / brand" required>
              <Input id="brand" name="brand" required placeholder="Northbound Media" />
            </Field>
            <Field id="contentType" label="Content type" required>
              <Select
                id="contentType"
                name="contentType"
                value={contentType}
                onChange={(event) => setContentType(event.target.value as ContentTypeSlug)}
              >
                {contentTypes.map((type) => (
                  <option key={type.slug} value={type.slug}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field id="topic" label="Article topic" required>
            <Input
              id="topic"
              name="topic"
              required
              placeholder="How mid-market brands should budget for link building"
            />
          </Field>

          <Field
            id="suggestedTitle"
            label="Suggested title"
            hint="Optional. Leave blank and we will propose one."
          >
            <Input id="suggestedTitle" name="suggestedTitle" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keywords and links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="targetKeyword" label="Target keyword" required>
              <Input id="targetKeyword" name="targetKeyword" required placeholder="link building budget" />
            </Field>
            <Field
              id="secondaryKeywords"
              label="Secondary keywords"
              hint="Comma separated."
            >
              <Input id="secondaryKeywords" name="secondaryKeywords" placeholder="seo budget, link cost" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="targetUrl" label="Target URL" hint="The page the link should point to.">
              <Input id="targetUrl" name="targetUrl" type="url" placeholder="https://example.com/services" />
            </Field>
            <Field id="anchorText" label="Anchor text">
              <Input id="anchorText" name="anchorText" placeholder="link building services" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Length, voice and audience</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="wordCount" label="Word count" required>
              <Select
                id="wordCount"
                name="wordCountChoice"
                value={wordCount}
                onChange={(event) => setWordCount(event.target.value)}
              >
                {wordCountOptions.map((option) => (
                  <option key={option} value={option}>
                    {option.toLocaleString('en-GB')} words
                  </option>
                ))}
                <option value="custom">Custom</option>
              </Select>
            </Field>

            {wordCount === 'custom' ? (
              <Field id="customWords" label="Custom word count" required>
                <Input
                  id="customWords"
                  type="number"
                  min={100}
                  max={20000}
                  step={50}
                  required
                  value={customWords}
                  onChange={(event) => setCustomWords(event.target.value)}
                  placeholder="1200"
                />
              </Field>
            ) : (
              <Field id="tone" label="Tone of voice">
                <Select id="tone" name="tone" defaultValue="professional">
                  {contentTones.map((tone) => (
                    <option key={tone.slug} value={tone.slug}>
                      {tone.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          {wordCount === 'custom' ? (
            <Field id="tone" label="Tone of voice">
              <Select id="tone" name="tone" defaultValue="professional">
                {contentTones.map((tone) => (
                  <option key={tone.slug} value={tone.slug}>
                    {tone.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="language" label="Language" required>
              <Select id="language" name="language" defaultValue="en-GB">
                {contentLanguages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="country" label="Country" hint="Where the audience is.">
              <Select id="country" name="country" defaultValue="">
                <option value="">No preference</option>
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field id="audience" label="Audience" hint="Who is reading this?">
            <Input id="audience" name="audience" placeholder="In-house marketing managers at B2B brands" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brief</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            id="references"
            label="Competitors / references"
            hint="One URL per line, or comma separated."
          >
            <textarea
              id="references"
              name="references"
              rows={3}
              className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
              placeholder="https://competitor.com/guide"
            />
          </Field>

          <Field id="instructions" label="Additional instructions">
            <textarea
              id="instructions"
              name="instructions"
              rows={4}
              className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
              placeholder="Anything the writer should know: structure, sources to avoid, phrases to use."
            />
          </Field>

          <Field
            id="briefFile"
            label="Upload brief"
            hint="Optional. DOC, DOCX, PDF, TXT or MD. The file is recorded with your brief; secure upload storage is not connected yet."
          >
            <Input
              id="briefFile"
              name="briefFile"
              type="file"
              accept=".doc,.docx,.pdf,.txt,.md,.rtf"
              className="file:mr-3 file:rounded file:border-0 file:bg-surface-sunken file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            <Field id="quantity" label="How many?">
              <Input
                id="quantity"
                type="number"
                min={1}
                max={50}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value) || 1)}
                className="w-24"
              />
            </Field>
            <div className="pb-2.5">
              <p className="text-[12px] text-muted">Estimated price</p>
              <p className="text-[15px] font-semibold text-ink">
                {unitPrice === null
                  ? 'On request'
                  : `${formatPrice(unitPrice * quantity)}${quantity > 1 ? ` (${formatPrice(unitPrice)} each)` : ''}`}
              </p>
            </div>
          </div>

          <Button type="submit" variant="accent" size="lg">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add to Order
          </Button>
        </CardContent>
      </Card>

      <p role="status" aria-live="polite" className="text-[13px] text-accent-700">
        {added}
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-negative">*</span> : null}
      </Label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1.5 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}
