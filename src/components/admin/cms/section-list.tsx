'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { FieldInput } from './field-input';
import {
  GROUP_LABELS,
  getComponent,
  listComponents,
  type ComponentDef,
  type ComponentGroup,
} from '@/lib/cms/components/schema';
import { DELAYS, ENTRANCES, SPEEDS, type PageSection } from '@/lib/cms/sections';
import {
  addSectionAction,
  deleteSectionAction,
  duplicateSectionAction,
  reorderSectionsAction,
  saveSectionAction,
  toggleSectionAction,
  type SectionActionState,
} from '@/app/admin/(protected)/pages/section-actions';
import type { FieldValue } from '@/lib/cms/types';
import { cn } from '@/lib/utils/cn';

/**
 * Building a page out of sections.
 *
 * The screen an administrator spends their time on, so it is deliberately a
 * list rather than a canvas. A section is a row: what it is, whether it shows,
 * and five things you can do to it. Opening one reveals its fields - the same
 * `FieldInput` the rest of the CMS uses, so a heading is edited the same way
 * here as anywhere else.
 *
 * What is absent is the point. There is nowhere to type a colour, a size, a
 * margin or a class, because a section has no field for any of those. An
 * editor picks a layout the component named and the frontend decides what
 * that means.
 */

const ENTRANCE_LABELS: Record<string, string> = {
  none: 'None',
  'fade-up': 'Fade up',
  'fade-in': 'Fade in',
  'slide-left': 'Slide in from the right',
  'slide-right': 'Slide in from the left',
  'scale-in': 'Scale in',
  stagger: 'Stagger the items',
};

export function SectionList({ pageSlug, sections }: { pageSlug: string; sections: PageSection[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  /** Send the whole order, because renumbering happens in one statement. */
  function moveTo(id: string, to: number) {
    const order = sections.map((section) => section.id);
    const from = order.indexOf(id);
    if (from === -1 || to < 0 || to >= order.length) return;

    order.splice(to, 0, ...order.splice(from, 1));
    const form = new FormData();
    form.set('pageSlug', pageSlug);
    form.set('order', order.join(','));
    void reorderSectionsAction(form);
  }

  return (
    <div className="space-y-3">
      {sections.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-5 py-8 text-center text-[13px] text-muted">
          This page has no sections yet, so it still renders the version built in code.
          Add one and this page starts being built here instead.
        </p>
      ) : null}

      <ul className="space-y-2">
        {sections.map((section, index) => {
          const component = getComponent(section.component);

          return (
            <li
              key={section.id}
              draggable={!section.locked}
              onDragStart={() => setDragging(section.id)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragging && dragging !== section.id) moveTo(dragging, index);
                setDragging(null);
              }}
              className={cn(
                'rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]',
                dragging === section.id && 'opacity-50',
                section.hidden && 'bg-surface',
              )}
            >
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <GripVertical
                  aria-hidden="true"
                  className={cn('h-4 w-4 shrink-0', section.locked ? 'text-line' : 'cursor-grab text-muted-soft')}
                />

                <button
                  type="button"
                  onClick={() => setOpen(open === section.id ? null : section.id)}
                  aria-expanded={open === section.id}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="text-[14px] font-medium text-ink">
                    {component?.label ?? section.component}
                  </span>
                  {component && component.variants.length > 1 ? (
                    <span className="ml-2 text-[12px] text-muted">
                      {component.variants.find((v) => v.key === section.variant)?.label}
                    </span>
                  ) : null}
                  {!component ? (
                    <span className="ml-2 text-[12px] text-negative">
                      This section type no longer exists
                    </span>
                  ) : null}
                </button>

                {section.hidden ? <Badge tone="muted">Hidden</Badge> : null}
                {section.locked ? (
                  <Badge tone="muted">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    Locked
                  </Badge>
                ) : null}

                {/* Up and down as well as dragging, because a drag is not
                    reachable from a keyboard and this is the only way to
                    reorder for anyone not using a mouse. */}
                <div className="flex items-center">
                  <IconButton
                    label={`Move ${component?.label ?? 'section'} up`}
                    disabled={index === 0 || section.locked}
                    onClick={() => moveTo(section.id, index - 1)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label={`Move ${component?.label ?? 'section'} down`}
                    disabled={index === sections.length - 1 || section.locked}
                    onClick={() => moveTo(section.id, index + 1)}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </IconButton>
                </div>

                <form action={toggleSectionAction}>
                  <input type="hidden" name="id" value={section.id} />
                  <IconSubmit label={section.hidden ? 'Show this section' : 'Hide this section'}>
                    {section.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </IconSubmit>
                </form>

                <form action={duplicateSectionAction}>
                  <input type="hidden" name="id" value={section.id} />
                  <IconSubmit label="Duplicate this section">
                    <Copy className="h-3.5 w-3.5" />
                  </IconSubmit>
                </form>

                {/* No delete on a locked section. The action refuses it too,
                    and so does the query - this is the courtesy, not the
                    control. */}
                {section.locked ? null : (
                  <form
                    action={deleteSectionAction}
                    onSubmit={(event) => {
                      if (!confirm(`Delete this ${component?.label ?? 'section'}? Its content goes with it.`)) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="id" value={section.id} />
                    <IconSubmit label="Delete this section" tone="negative">
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconSubmit>
                  </form>
                )}
              </div>

              {open === section.id && component ? (
                <SectionEditor section={section} component={component} />
              ) : null}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <SectionLibrary pageSlug={pageSlug} onClose={() => setAdding(false)} />
      ) : (
        <Button type="button" variant="outline" className="w-full" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add section
        </Button>
      )}
    </div>
  );
}

/** The fields of one section, plus its layout and how it arrives. */
function SectionEditor({ section, component }: { section: PageSection; component: ComponentDef }) {
  const [state, formAction] = useActionState<SectionActionState, FormData>(saveSectionAction, {});
  const [values, setValues] = useState<Record<string, unknown>>(section.values);

  return (
    <form action={formAction} className="space-y-4 border-t border-line px-4 py-4">
      <input type="hidden" name="id" value={section.id} />
      {/* One field, because a form holds strings and a section's shape is its
          component's business rather than this form's. */}
      <input type="hidden" name="values" value={JSON.stringify(values)} />

      {component.variants.length > 1 ? (
        <div>
          <Label htmlFor={`variant-${section.id}`}>Layout</Label>
          <Select
            id={`variant-${section.id}`}
            name="variant"
            defaultValue={section.variant}
            className="mt-1.5"
          >
            {component.variants.map((variant) => (
              <option key={variant.key} value={variant.key}>
                {variant.label}
                {variant.help ? ` - ${variant.help}` : ''}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <input type="hidden" name="variant" value={section.variant} />
      )}

      {component.fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          idPrefix={`section-${section.id}`}
          value={values[field.key] as FieldValue}
          defaultValue={component.defaults[field.key] as FieldValue}
          onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
        />
      ))}

      {component.animatable ? (
        <fieldset className="rounded-md border border-line p-3">
          <legend className="px-1 text-[12px] font-medium text-ink-soft">Animation</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`entrance-${section.id}`}>Entrance</Label>
              <Select id={`entrance-${section.id}`} name="entrance" defaultValue={section.animation.entrance} className="mt-1.5">
                {ENTRANCES.map((entrance) => (
                  <option key={entrance} value={entrance}>
                    {ENTRANCE_LABELS[entrance]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`speed-${section.id}`}>Speed</Label>
              <Select id={`speed-${section.id}`} name="speed" defaultValue={section.animation.speed} className="mt-1.5">
                {SPEEDS.map((speed) => (
                  <option key={speed} value={speed}>
                    {speed[0].toUpperCase() + speed.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`delay-${section.id}`}>Delay</Label>
              <Select id={`delay-${section.id}`} name="delay" defaultValue={section.animation.delay} className="mt-1.5">
                {DELAYS.map((delay) => (
                  <option key={delay} value={delay}>
                    {delay[0].toUpperCase() + delay.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Anything already on screen when the page loads appears without animating, and
            nothing animates for a visitor who has asked their device for less motion.
          </p>
        </fieldset>
      ) : null}

      <div className="flex items-center gap-3">
        <SaveButton />
        {state.error ? <p className="text-[13px] text-negative">{state.error}</p> : null}
        {state.message ? <p className="text-[13px] text-muted">{state.message}</p> : null}
      </div>
    </form>
  );
}

/** The "add section" library, grouped so it can be read rather than scanned. */
function SectionLibrary({ pageSlug, onClose }: { pageSlug: string; onClose: () => void }) {
  const [state, formAction] = useActionState<SectionActionState, FormData>(addSectionAction, {});
  const groups = new Map<ComponentGroup, ComponentDef[]>();
  for (const component of listComponents()) {
    groups.set(component.group, [...(groups.get(component.group) ?? []), component]);
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-ink">Add a section</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>

      {state.error ? <p className="mt-2 text-[13px] text-negative">{state.error}</p> : null}

      <div className="mt-4 space-y-5">
        {[...groups.entries()].map(([group, components]) => (
          <div key={group}>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
              {GROUP_LABELS[group]}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {components.map((component) => (
                <form key={component.key} action={formAction}>
                  <input type="hidden" name="pageSlug" value={pageSlug} />
                  <input type="hidden" name="component" value={component.key} />
                  <button
                    type="submit"
                    className="w-full rounded-md border border-line px-3 py-2.5 text-left transition-colors hover:border-accent-500 hover:bg-accent-50"
                  >
                    <span className="block text-[13px] font-medium text-ink">{component.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">
                      {component.description}
                    </span>
                  </button>
                </form>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'muted' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'muted' && 'bg-surface-sunken text-muted',
      )}
    >
      {children}
    </span>
  );
}

function IconButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded text-ink-soft transition-colors hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function IconSubmit({
  children,
  label,
  tone,
}: {
  children: React.ReactNode;
  label: string;
  tone?: 'negative';
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      disabled={pending}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-40',
        tone === 'negative'
          ? 'text-muted hover:bg-negative/10 hover:text-negative'
          : 'text-ink-soft hover:bg-surface hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="accent" size="sm" disabled={pending}>
      {pending ? 'Saving...' : 'Save section'}
    </Button>
  );
}
