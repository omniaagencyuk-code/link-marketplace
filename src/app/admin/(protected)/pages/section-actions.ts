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
import { blueprintFor, canConvert } from '@/lib/cms/migrate/page-to-sections';
import { getRegisteredPage } from '@/lib/cms/registry';
import { customPageService } from '@/lib/services/custom-page-service';
import { customPageDefaults, customPageDefinition, readTemplate } from '@/lib/cms/custom-page';
import { pageContentService } from '@/lib/services/page-content-service';
import { resolvePage } from '@/lib/cms/resolve';
import type { PageValues } from '@/lib/cms/types';

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

  /*
    The first section on a page that still renders from a template would take
    the whole page over - sections are the page, so one section is the whole
    of it. That is a page blanked by an editor who meant to add a band to the
    bottom of it, so it is refused: convert first, which brings every band
    across, then add to the result.

    Only where there is something to convert to. A page whose template has no
    section layout yet keeps the old behaviour, because for it the sections
    are still an addition rather than a replacement.
  */
  const page = await convertible(pageSlug);
  if (page && canConvert(page.template)) {
    const existing = await pageSectionService.allForPage(pageSlug);
    if (existing.length === 0) {
      return {
        error: 'Convert this page to sections first - otherwise this one section becomes the whole page.',
      };
    }
  }

  const created = await pageSectionService.create({
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

  /*
    Where it goes. `create` appends, which is right for the button at the
    bottom of the list and wrong for the one between two sections - somebody
    inserting a band halfway down a page means halfway down the page, and
    having to drag it there afterwards is the sort of thing that makes a page
    builder tiring to use.
  */
  const after = String(formData.get('after') ?? '').trim();
  if (after) {
    const page = await pageSectionService.allForPage(pageSlug);
    const order = page.map((section) => section.id).filter((id) => id !== created.id);
    const at = order.indexOf(after);
    if (at !== -1) {
      order.splice(at + 1, 0, created.id);
      await pageSectionService.reorder(pageSlug, order);
    }
  }

  refresh(pageSlug);
  return { message: `${component.label} added.` };
}

/**
 * Turn a page that renders from a template into a page that renders from its
 * sections.
 *
 * Additive, and that is the whole safety story. It writes rows and changes
 * nothing else: the page's existing content stays in `page_content` exactly
 * as it was, so the conversion can be compared against the live page and
 * undone by deleting the rows it made. The template stops being used when the
 * rows are right - which is a look at the page, not a migration running.
 *
 * Refused on a page that already has sections, because "convert" on a page
 * somebody has already built would append a second copy of it.
 */
export async function convertPageToSectionsAction(
  _previous: SectionActionState,
  formData: FormData,
): Promise<SectionActionState> {
  const admin = await requireAdminSession();

  const pageSlug = String(formData.get('pageSlug') ?? '').trim();
  const page = await convertible(pageSlug);
  if (!page) return { error: 'That page cannot be converted.' };

  if (!canConvert(page.template)) {
    return { error: `There is no section layout for a ${page.template} page yet.` };
  }

  const existing = await pageSectionService.allForPage(pageSlug);
  if (existing.length > 0) {
    return { error: 'This page already has sections. Delete them first to convert again.' };
  }

  const blueprints = blueprintFor(page.template, page.values);
  if (blueprints.length === 0) return { error: 'This page has no content to convert.' };

  // In order, one at a time: `create` appends to the end of the page, so the
  // order they are written in is the order they end up in.
  for (const blueprint of blueprints) {
    await pageSectionService.create({
      pageSlug,
      component: blueprint.component,
      variant: blueprint.variant,
      values: blueprint.values,
      locked: blueprint.locked,
      updatedBy: admin.email,
    });
  }

  refresh(pageSlug, page.path);
  return {
    message: `${blueprints.length} sections created. Check the live page against them before relying on it.`,
  };
}

/** A page's template, resolved content and path, whichever kind it is. */
async function convertible(
  slug: string,
): Promise<{ template: string; values: PageValues; path: string } | null> {
  if (!slug) return null;

  const registered = getRegisteredPage(slug);
  if (registered) {
    const saved = await pageContentService.getOverrides(slug);
    const resolved = resolvePage(registered.definition, registered.defaults, saved?.values);
    return {
      template: registered.definition.template ?? 'service',
      values: resolved.values,
      path: registered.definition.path,
    };
  }

  const custom = await customPageService.getForAdmin(slug);
  if (!custom) return null;

  const template = readTemplate(custom.template);
  const resolved = resolvePage(
    customPageDefinition(custom),
    customPageDefaults(custom.label, template),
    custom.values,
  );
  return { template, values: resolved.values, path: `/${slug}` };
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

  // Below the section it was inserted under, when it was inserted rather than
  // appended. Same rule as adding a new one.
  const after = String(formData.get('after') ?? '').trim();
  if (after) {
    const page = await pageSectionService.allForPage(pageSlug);
    const order = page.map((section) => section.id).filter((id) => id !== added.id);
    const at = order.indexOf(after);
    if (at !== -1) {
      order.splice(at + 1, 0, added.id);
      await pageSectionService.reorder(pageSlug, order);
    }
  }

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
