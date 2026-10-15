'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetMenuAction, saveMenuAction } from '@/app/admin/(protected)/menus/actions';
import {
  LIMITS,
  MENU_HELP,
  MENU_LABELS,
  leadsSomewhere,
  safeHref,
  type MenuKey,
  type MenuNode,
} from '@/lib/navigation/menus';
import { cn } from '@/lib/utils/cn';
import { formatDateTime } from '@/lib/utils/format';

/**
 * The header and footer menus, edited.
 *
 * One editor for all three, because all three are the same shape: a list of
 * labelled items, each of which may have a list of links under it. The header
 * draws those children as a dropdown and the footer draws the parent as a
 * column heading; neither difference is stored, so neither is edited here.
 *
 * ## Why nothing is saved per keystroke
 *
 * A menu is on every page of the site. Saving each field as it changes would
 * publish a half-typed label to the whole site and then publish the next
 * character, and the editor would have no way back from a mistake except to
 * type the old value from memory. So the whole menu is one value held here
 * and written once, and Reset deletes the row rather than writing today's
 * defaults back - which is what keeps a reset menu following the code.
 *
 * ## What it checks, and what checks it
 *
 * Everything warned about here is enforced again in `saveMenuAction`, which
 * rebuilds the posted menu with `readMenu` rather than trusting it. These
 * warnings exist so an editor finds out before saving rather than after; the
 * control is on the server, because this form is a convenience and the action
 * behind it is reachable without it.
 */

export interface MenuState {
  key: MenuKey;
  items: MenuNode[];
  /** True when a row exists, so Reset is worth offering. */
  edited: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

const blank = (): MenuNode => ({ label: '', href: '', description: '', children: [] });

export function MenusEditor({ menus }: { menus: MenuState[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [active, setActive] = useState<MenuKey>(menus[0]?.key ?? 'header-signed-out');

  /*
    Every menu is held, not just the one on screen. Switching tabs to look at
    the footer and coming back must not lose what was typed in the header -
    which is the whole reason the three are one form rather than three.
  */
  const initial = useMemo(
    () => Object.fromEntries(menus.map((menu) => [menu.key, menu.items])) as Record<MenuKey, MenuNode[]>,
    [menus],
  );
  const [drafts, setDrafts] = useState<Record<MenuKey, MenuNode[]>>(initial);

  const current = menus.find((menu) => menu.key === active) ?? menus[0]!;
  const items = drafts[active] ?? [];
  const dirty = JSON.stringify(items) !== JSON.stringify(initial[active]);

  function update(next: MenuNode[]) {
    setStatus(null);
    setDrafts((all) => ({ ...all, [active]: next }));
  }

  function save() {
    setStatus(null);
    startTransition(async () => {
      const result = await saveMenuAction(active, items);
      if (!result.ok) {
        setStatus({ kind: 'error', message: result.error ?? 'Could not save.' });
        return;
      }
      setStatus({ kind: 'ok', message: `${MENU_LABELS[active]} saved. The live site is updated.` });
      router.refresh();
    });
  }

  function reset() {
    setStatus(null);
    startTransition(async () => {
      const result = await resetMenuAction(active);
      if (!result.ok) {
        setStatus({ kind: 'error', message: result.error ?? 'Could not reset.' });
        return;
      }
      setStatus({ kind: 'ok', message: 'Back to the menu that ships in the code.' });
      router.refresh();
    });
  }

  /*
    The two things worth saying before somebody presses Save, rather than
    after. Both are refusals on the server, so this is the earlier half of
    one rule rather than a second one.
  */
  const unlabelled = items.filter((item) => !item.label.trim()).length;
  const goesNowhere = items.length > 0 && !leadsSomewhere(items);

  return (
    <>
      {/* ------------------------------------------------------- which menu */}
      <div className="mb-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Menus">
        {menus.map((menu) => {
          const changed = JSON.stringify(drafts[menu.key]) !== JSON.stringify(initial[menu.key]);
          return (
            <button
              key={menu.key}
              type="button"
              role="tab"
              aria-selected={menu.key === active}
              onClick={() => {
                setActive(menu.key);
                setStatus(null);
              }}
              className={cn(
                'rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                menu.key === active
                  ? 'bg-ink text-white'
                  : 'bg-surface-sunken text-ink-soft hover:text-ink',
              )}
            >
              {MENU_LABELS[menu.key]}
              {/* An unsaved tab says so, because the save button only ever
                  writes the menu on screen. */}
              {changed ? <span className="ml-1.5 text-[11px]">•</span> : null}
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>{MENU_LABELS[active]}</CardTitle>
              <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
                {MENU_HELP[active]}
              </p>
            </div>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                current.edited ? 'bg-accent-50 text-accent-800' : 'bg-surface-sunken text-muted',
              )}
            >
              {current.edited ? 'Edited' : 'Shipped menu'}
            </span>
          </div>
          {current.edited && current.updatedAt ? (
            <p className="mt-2 text-[12px] text-muted">
              Saved {formatDateTime(current.updatedAt)}
              {current.updatedBy ? ` by ${current.updatedBy}` : ''}.
            </p>
          ) : (
            <p className="mt-2 text-[12px] text-muted">
              Nobody has edited this one, so the site is showing the menu in the code. Saving takes
              it over; Reset hands it back.
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {items.map((item, index) => (
            <ItemEditor
              key={index}
              item={item}
              index={index}
              count={items.length}
              footer={active === 'footer'}
              onChange={(next) =>
                update(items.map((row, rowIndex) => (rowIndex === index ? next : row)))
              }
              onRemove={() => update(items.filter((_, rowIndex) => rowIndex !== index))}
              onMove={(direction) => update(moved(items, index, direction))}
            />
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={items.length >= LIMITS.items}
              onClick={() => update([...items, blank()])}
            >
              <Plus className="h-3.5 w-3.5" />
              {active === 'footer' ? 'Add column' : 'Add item'}
            </Button>
            {items.length >= LIMITS.items ? (
              <p className="text-[12px] text-muted">
                {LIMITS.items} is as many as the layout holds.
              </p>
            ) : null}
          </div>

          {unlabelled > 0 ? (
            <Notice tone="warn">
              {unlabelled === 1
                ? 'One item has no label, and an item with no label cannot be saved.'
                : `${unlabelled} items have no label, and an item with no label cannot be saved.`}
            </Notice>
          ) : null}

          {goesNowhere ? (
            <Notice tone="warn">
              Nothing in this menu has a link yet, so it would be navigation that does not
              navigate. Give at least one item or child a link.
            </Notice>
          ) : null}

          {status ? (
            <Notice tone={status.kind === 'ok' ? 'ok' : 'warn'}>{status.message}</Notice>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button type="button" variant="accent" onClick={save} disabled={pending || !dirty}>
              <Save className="h-3.5 w-3.5" />
              {pending ? 'Saving...' : 'Save menu'}
            </Button>
            {current.edited ? (
              <Button type="button" variant="outline" onClick={reset} disabled={pending}>
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to the shipped menu
              </Button>
            ) : null}
            {dirty ? <span className="text-[12px] text-muted">Unsaved changes.</span> : null}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/** One top-level item: a header entry, or a footer column. */
function ItemEditor({
  item,
  index,
  count,
  footer,
  onChange,
  onRemove,
  onMove,
}: {
  item: MenuNode;
  index: number;
  count: number;
  footer: boolean;
  onChange: (item: MenuNode) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = item.label.trim() || `Item ${index + 1}`;
  const id = `menu-item-${index}`;

  return (
    <div className="rounded-lg border border-line bg-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="tabular text-[11px] text-muted-soft">{index + 1}</span>
          <span className="truncate text-[13px] font-medium text-ink">{label}</span>
          <span className="shrink-0 font-mono text-[11px] text-muted-soft">
            {item.href || (footer ? 'heading' : 'no link')}
          </span>
          {item.children.length > 0 ? (
            <span className="shrink-0 text-[11px] text-muted">
              {item.children.length} {item.children.length === 1 ? 'link' : 'links'}
            </span>
          ) : null}
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${label} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${label} down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${label}`}
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {open ? (
        <div className="space-y-4 border-t border-line px-3 py-3.5">
          <NodeFields
            node={item}
            idPrefix={id}
            onChange={onChange}
            hrefHelp={
              footer
                ? 'Leave blank for a plain column heading, which is what the footer columns are.'
                : 'Leave blank to make this a label with a dropdown under it and nothing to click.'
            }
            describable={!footer}
          />

          {/* ------------------------------------------------- the children */}
          <div className="rounded-md bg-surface px-3 py-3">
            <p className="text-[12px] font-semibold text-ink">
              {footer ? 'Links in this column' : 'Dropdown links'}
            </p>

            <div className="mt-2.5 space-y-2.5">
              {item.children.map((child, childIndex) => (
                <div key={childIndex} className="rounded-md border border-line bg-white px-3 py-3">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-ink">
                      {child.label.trim() || `Link ${childIndex + 1}`}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move link ${childIndex + 1} up`}
                        disabled={childIndex === 0}
                        onClick={() =>
                          onChange({ ...item, children: moved(item.children, childIndex, -1) })
                        }
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move link ${childIndex + 1} down`}
                        disabled={childIndex === item.children.length - 1}
                        onClick={() =>
                          onChange({ ...item, children: moved(item.children, childIndex, 1) })
                        }
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove link ${childIndex + 1}`}
                        onClick={() =>
                          onChange({
                            ...item,
                            children: item.children.filter((_, at) => at !== childIndex),
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <NodeFields
                    node={child}
                    idPrefix={`${id}-child-${childIndex}`}
                    onChange={(next) =>
                      onChange({
                        ...item,
                        children: item.children.map((row, at) => (at === childIndex ? next : row)),
                      })
                    }
                    hrefHelp="Where this link goes. A path like /pricing, or a full https:// address."
                    describable={!footer}
                  />
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2.5"
              disabled={item.children.length >= LIMITS.children}
              onClick={() => onChange({ ...item, children: [...item.children, blank()] })}
            >
              <Plus className="h-3.5 w-3.5" />
              Add link
            </Button>
            {item.children.length >= LIMITS.children ? (
              <p className="mt-1.5 text-[12px] text-muted">
                {LIMITS.children} is as many as fits under one item.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The three fields every node has, wherever it sits. */
function NodeFields({
  node,
  idPrefix,
  onChange,
  hrefHelp,
  describable,
}: {
  node: MenuNode;
  idPrefix: string;
  onChange: (node: MenuNode) => void;
  hrefHelp: string;
  describable: boolean;
}) {
  /*
    The same `safeHref` the server saves through, asked here as a question
    rather than copied as a rule: anything it refuses is dropped on save, so
    saying so now is the difference between a typo and a link that quietly
    vanished. An empty box is not a refusal - a heading has no link.
  */
  const dropped = node.href.trim() !== '' && safeHref(node.href) === '';

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor={`${idPrefix}-label`}>Label</Label>
        <Input
          id={`${idPrefix}-label`}
          value={node.label}
          maxLength={LIMITS.label}
          placeholder="Pricing"
          className="mt-1.5"
          onChange={(event) => onChange({ ...node, label: event.target.value })}
        />
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-href`}>Link</Label>
        <Input
          id={`${idPrefix}-href`}
          value={node.href}
          maxLength={LIMITS.href}
          placeholder="/pricing"
          className="mt-1.5"
          onChange={(event) => onChange({ ...node, href: event.target.value })}
        />
        <p className={cn('mt-1.5 text-[12px]', dropped ? 'text-red-700' : 'text-muted')}>
          {dropped
            ? 'This is not a link the site will store. Use a path like /pricing, a full https:// address, a mailto: or a tel:.'
            : hrefHelp}
        </p>
      </div>

      {describable ? (
        <div className="sm:col-span-2">
          <Label htmlFor={`${idPrefix}-description`}>Description</Label>
          <Input
            id={`${idPrefix}-description`}
            value={node.description}
            maxLength={LIMITS.description}
            placeholder="The full service, end to end."
            className="mt-1.5"
            onChange={(event) => onChange({ ...node, description: event.target.value })}
          />
          <p className="mt-1.5 text-[12px] text-muted">
            One line under the label, shown in the header dropdown. Optional.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Notice({ tone, children }: { tone: 'ok' | 'warn'; children: React.ReactNode }) {
  const Icon = tone === 'ok' ? CheckCircle2 : AlertCircle;
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-md px-3 py-2.5 text-[13px]',
        tone === 'ok' ? 'bg-accent-50 text-accent-800' : 'bg-sun-50 text-ink',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** One row, one place along. Used for items and for their children. */
function moved(list: MenuNode[], index: number, direction: -1 | 1): MenuNode[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  const [row] = next.splice(index, 1);
  next.splice(target, 0, row as MenuNode);
  return next;
}
