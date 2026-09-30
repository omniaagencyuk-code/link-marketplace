'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { pageSectionService } from '@/lib/services/page-section-service';
import {
  cleanSectionValues,
  getComponent,
  resolveVariant,
} from '@/lib/cms/components/schema';
import { readAnimation } from '@/lib/cms/sections';
import { sanitiseText } from '@/lib/import/normalise';

/**
 * Building a page out of sections.
 *
 * Every action re-checks the admin session. Server actions have their own
 * endpoints and are reachable without rendering the page that offers them, so
 * a hidden button is a courtesy to whoever is looking at the screen rather
 * than a control.
 *
 * Every rule the editor appears to enforce is enforced again here, and the
 * important ones a third time in the database: a locked section cannot be
 * deleted, a variant has to be one the component named, and a value has to be
 * a field the component declares. What arrives is rebuilt from the schema
 * rather than filtered against it, so a key nobody declared cannot survive
 * however it was posted.
 */

export interface SectionActionState {
  error?: string;
  /** What just happened, for the line the editor shows afterwards. */
  message?: string;
}

/** Both the editor and the public page have to be refreshed after a change. */
function refresh(pageSlug: string, path?: string) {
  revalidatePath(`/admin/pages/${pageSlug}`);
  if (path) revalidatePath(path);
}

export async function addSectionAction(
  _previous: SectionActionState,
  formData: FormData,
): Promise<SectionActionState> {
  const admin = await requireAdminSession();

  const pageSlug = String(formData.get('pageSlug') ?? '').trim();
  const key = String(formData.get('component') ?? '').trim();
  const component = getComponent(key);
  if (!pageSlug || !component) return { error: 'That is not a section type.' };

  await pageSectionService.create({
    pageSlug,
    component: component.key,
    variant: component.variants[0]?.key ?? 'default',
    // The component's own defaults, so a section that has just been added
    // renders as something rather than as a blank band on the page.
    values: cleanSectionValues(component, component.defaults),
    // Structural sections arrive locked. A hero that can be dragged to the
    // bottom of the page is a mistake waiting to be made; its content stays
    // editable either way.
    locked: component.structural ?? false,
    updatedBy: admin.email,
  });

  refresh(pageSlug);
  return { message: `${component.label} added.` };
}

export async function saveSectionAction(
  _previous: SectionActionState,
  formData: FormData,
): Promise<SectionActionState> {
  const admin = await requireAdminSession();

  const id = String(formData.get('id') ?? '');
  const section = await pageSectionService.find(id);
  if (!section) return { error: 'That section no longer exists.' };

  const component = getComponent(section.component);
  if (!component) {
    return { error: 'This section type is no longer available, so it cannot be edited.' };
  }

  let values: unknown;
  try {
    values = JSON.parse(String(formData.get('values') ?? '{}'));
  } catch {
    return { error: 'The content did not arrive intact. Try saving again.' };
  }

  await pageSectionService.update(
    id,
    {
      variant: resolveVariant(component, String(formData.get('variant') ?? '')),
      values: cleanSectionValues(component, values),
      // An entrance the component cannot carry is dropped rather than stored:
      // otherwise the setting sits in the database looking as though it works.
      animation: component.animatable
        ? readAnimation({
            entrance: formData.get('entrance'),
            speed: formData.get('speed'),
            delay: formData.get('delay'),
          })
        : readAnimation({}),
    },
    admin.email,
  );

  refresh(section.pageSlug);
  return { message: 'Saved.' };
}

export async function toggleSectionAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  const id = String(formData.get('id') ?? '');
  const section = await pageSectionService.find(id);
  if (!section) return;

  await pageSectionService.setHidden(id, !section.hidden, admin.email);
  refresh(section.pageSlug);
}

export async function duplicateSectionAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  const id = String(formData.get('id') ?? '');
  const section = await pageSectionService.find(id);
  if (!section) return;

  await pageSectionService.duplicate(id, admin.email);
  refresh(section.pageSlug);
}

export async function deleteSectionAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = String(formData.get('id') ?? '');
  const section = await pageSectionService.find(id);
  if (!section) return;

  // Locked is refused here and again by the delete itself, which carries
  // `locked = false` in its own filter. The button is not shown either, and
  // that is the least of the three.
  if (section.locked) return;

  await pageSectionService.remove(id);
  refresh(section.pageSlug);
}

/**
 * Put a page in this order.
 *
 * The whole order arrives, not a pair to swap, because renumbering is one
 * statement and a statement needs the finished order. Ids that do not belong
 * to this page are refused by the database function rather than trusted.
 */
/**
 * Save a section for use on other pages.
 *
 * Nothing visibly changes on the page it was saved from - the global starts
 * as a copy of what was already there. What changes is where future edits go.
 */
export async function saveAsGlobalAction(
  _previous: SectionActionState,
  formData: FormData,
): Promise<SectionActionState> {
  const admin = await requireAdminSession();

  const id = String(formData.get('id') ?? '');
  const name = sanitiseText(String(formData.get('name') ?? ''), 120).trim();
  if (!name) return { error: 'Give it a name so you can find it on other pages.' };

  const section = await pageSectionService.find(id);
  if (!section) return { error: 'That section no longer exists.' };
  if (section.globalId) return { error: 'This section already comes from a global one.' };

  const global = await pageSectionService.saveAsGlobal(id, name, admin.email);
  if (!global) return { error: 'That could not be saved.' };

  refresh(section.pageSlug);
  return { message: `Saved as “${name}”. Editing it changes every page using it.` };
}

/** Add a copy of a global section to this page. */
export async function addGlobalAction(
  _previous: SectionActionState,
  formData: FormData,
): Promise<SectionActionState> {
  const admin = await requireAdminSession();

  const pageSlug = String(formData.get('pageSlug') ?? '').trim();
  const globalId = String(formData.get('globalId') ?? '').trim();
  if (!pageSlug || !globalId) return { error: 'Choose a section to add.' };

  const added = await pageSectionService.addGlobal(pageSlug, globalId, admin.email);
  if (!added) return { error: 'That section no longer exists.' };

  refresh(pageSlug);
  return { message: 'Added.' };
}

/**
 * Make a section this page's own.
 *
 * The content comes down with it, so the page renders exactly what it
 * rendered a moment ago. Only where the next edit lands has changed.
 */
export async function detachGlobalAction(formData: FormData): Promise<void> {
  const admin = await requireAdminSession();
  const id = String(formData.get('id') ?? '');
  const section = await pageSectionService.find(id);
  if (!section) return;

  await pageSectionService.detach(id, admin.email);
  refresh(section.pageSlug);
}

export async function reorderSectionsAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const pageSlug = String(formData.get('pageSlug') ?? '').trim();
  const ids = String(formData.get('order') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (!pageSlug || ids.length === 0) return;

  await pageSectionService.reorder(pageSlug, ids);
  refresh(pageSlug);
}
