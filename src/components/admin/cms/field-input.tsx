'use client';

import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';
import type { FieldDef, FieldValue, ImageValue, LinkValue } from '@/lib/cms/types';

/**
 * One editable field.
 *
 * Every input is controlled by the page editor above it, so the whole form is
 * a single value tree that can be saved, reset or compared against defaults in
 * one place. Each field shows a reset control when it differs from the shipped
 * copy, which is the escape hatch that makes editing safe to experiment with.
 */

export function FieldInput({
  field,
  value,
  defaultValue,
  onChange,
  idPrefix,
}: {
  field: FieldDef;
  value: FieldValue;
  defaultValue: FieldValue;
  onChange: (value: FieldValue) => void;
  idPrefix: string;
}) {
  const id = `${idPrefix}-${field.key}`;
  const changed = JSON.stringify(value) !== JSON.stringify(defaultValue);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{field.label}</Label>
        {changed ? (
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Reset
          </button>
        ) : null}
      </div>

      <div className="mt-1.5">
        <FieldControl
          field={field}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          id={id}
        />
      </div>

      {field.help ? <p className="mt-1.5 text-[12px] text-muted">{field.help}</p> : null}
    </div>
  );
}

function FieldControl({
  field,
  value,
  defaultValue,
  onChange,
  id,
}: {
  field: FieldDef;
  value: FieldValue;
  defaultValue: FieldValue;
  onChange: (value: FieldValue) => void;
  id: string;
}) {
  switch (field.type) {
    case 'text':
      return (
        <>
          <Input
            id={id}
            value={typeof value === 'string' ? value : ''}
            maxLength={field.maxLength}
            onChange={(event) => onChange(event.target.value)}
          />
          <CharCount value={value} max={field.maxLength} />
        </>
      );

    case 'textarea':
    case 'richtext':
      return (
        <>
          <textarea
            id={id}
            rows={field.rows ?? 4}
            value={typeof value === 'string' ? value : ''}
            maxLength={field.maxLength}
            onChange={(event) => onChange(event.target.value)}
            className={cn(
              'w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none',
              field.type === 'richtext' && 'font-mono text-[13px] leading-relaxed',
            )}
          />
          <CharCount value={value} max={field.maxLength} />
        </>
      );

    case 'link': {
      const current: LinkValue =
        typeof value === 'object' && value !== null && 'href' in value
          ? (value as LinkValue)
          : { label: '', href: '/' };
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            id={id}
            value={current.label}
            placeholder="Button text"
            onChange={(event) => onChange({ ...current, label: event.target.value })}
          />
          <Input
            value={current.href}
            placeholder="/signup"
            onChange={(event) => onChange({ ...current, href: event.target.value })}
          />
        </div>
      );
    }

    case 'image': {
      const current: ImageValue =
        typeof value === 'object' && value !== null && 'src' in value
          ? (value as ImageValue)
          : { src: '', alt: '' };
      return (
        <div className="space-y-2">
          <Input
            id={id}
            value={current.src}
            placeholder="/images/example.webp"
            onChange={(event) => onChange({ ...current, src: event.target.value })}
          />
          <Input
            value={current.alt}
            placeholder="Describe the image for screen readers"
            onChange={(event) => onChange({ ...current, alt: event.target.value })}
          />
          {current.src ? (
            /* eslint-disable-next-line @next/next/no-img-element --
               editor-supplied paths, including external ones, which the image
               optimiser would reject. This is an admin preview, not a page. */
            <img
              src={current.src}
              alt={current.alt}
              className="max-h-32 rounded-md border border-line object-contain"
            />
          ) : null}
        </div>
      );
    }

    case 'list':
      return (
        <ListEditor
          field={field}
          value={Array.isArray(value) ? value : []}
          defaultValue={Array.isArray(defaultValue) ? defaultValue : []}
          onChange={onChange}
          idPrefix={id}
        />
      );

    default:
      return null;
  }
}

function CharCount({ value, max }: { value: FieldValue; max?: number }) {
  if (!max || typeof value !== 'string') return null;
  const used = value.length;
  return (
    <p
      className={cn(
        'mt-1 text-right text-[11px] tabular',
        used > max * 0.9 ? 'text-amber-600' : 'text-muted-soft',
      )}
    >
      {used} / {max}
    </p>
  );
}

type ListRow = Record<string, string | LinkValue | ImageValue>;

function ListEditor({
  field,
  value,
  defaultValue,
  onChange,
  idPrefix,
}: {
  field: Extract<FieldDef, { type: 'list' }>;
  value: ListRow[];
  defaultValue: ListRow[];
  onChange: (value: FieldValue) => void;
  idPrefix: string;
}) {
  const [openRow, setOpenRow] = useState<number | null>(0);

  const atMax = field.maxItems !== undefined && value.length >= field.maxItems;
  const atMin = field.minItems !== undefined && value.length <= field.minItems;

  function updateRow(index: number, key: string, next: string | LinkValue | ImageValue) {
    onChange(value.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: next } : row)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved as ListRow);
    onChange(next);
    setOpenRow(target);
  }

  function addRow() {
    // Seed a new entry from the first default, so an editor starts from a
    // filled-in example rather than a set of empty boxes.
    const template = defaultValue[0];
    const blank: ListRow = {};
    for (const itemField of field.fields) {
      blank[itemField.key] =
        itemField.type === 'link'
          ? { label: '', href: '/' }
          : itemField.type === 'image'
            ? { src: '', alt: '' }
            : '';
    }
    onChange([...value, template ? { ...blank } : blank]);
    setOpenRow(value.length);
  }

  return (
    <div className="space-y-2">
      {value.map((row, index) => {
        const labelKey = field.itemLabelKey ?? field.fields[0]?.key ?? '';
        const rawLabel = row[labelKey];
        const label = typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel : `Item ${index + 1}`;
        const open = openRow === index;

        return (
          <div key={index} className="rounded-lg border border-line bg-white">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setOpenRow(open ? null : index)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="tabular text-[11px] text-muted-soft">{index + 1}</span>
                <span className="truncate text-[13px] font-medium text-ink">{label}</span>
              </button>

              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${label} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${label} down`}
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${label}`}
                  disabled={atMin}
                  onClick={() => {
                    onChange(value.filter((_, rowIndex) => rowIndex !== index));
                    setOpenRow(null);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {open ? (
              <div className="space-y-4 border-t border-line px-3 py-3.5">
                {field.fields.map((itemField) => (
                  <FieldInput
                    key={itemField.key}
                    field={itemField}
                    value={(row[itemField.key] ?? '') as FieldValue}
                    defaultValue={(defaultValue[index]?.[itemField.key] ?? '') as FieldValue}
                    onChange={(next) =>
                      updateRow(index, itemField.key, next as string | LinkValue | ImageValue)
                    }
                    idPrefix={`${idPrefix}-${index}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={atMax}>
        <Plus className="h-3.5 w-3.5" />
        Add {field.label.replace(/s$/, '').toLowerCase()}
      </Button>
      {atMax ? (
        <p className="text-[12px] text-muted">
          The layout is designed for up to {field.maxItems}.
        </p>
      ) : null}
    </div>
  );
}
