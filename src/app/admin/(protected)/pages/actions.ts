'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { pageContentService } from '@/lib/services/page-content-service';
import { getRegisteredPage } from '@/lib/cms/registry';
import { customPageService } from '@/lib/services/custom-page-service';
import {
  checkSlug,
  customPageDefaults,
  customPageDefinition,
  readTemplate,
  slugify,
} from '@/lib/cms/custom-page';
import { readStarter } from '@/lib/cms/starters';
import { blueprintFor, canConvert } from '@/lib/cms/migrate/page-to-sections';
import { cleanSectionValues, getComponent } from '@/lib/cms/components/schema';
import { pageSectionService } from '@/lib/services/page-section-service';
import { sanitiseText } from '@/lib/import/normalise';
import { cleanRichTextDoc, isRichTextDoc } from '@/lib/cms/rich-text';
import type { FieldDef, FieldValue, ImageValue, LinkValue, PageDef, PageValues } from '@/lib/cms/types';
import type { RichTextDoc } from '@/lib/cms/rich-text';

/**
 * Saving page content.
 *
 * Values arrive from the browser, so nothing is trusted: the submitted tree is
 * rebuilt field by field against the page's declared schema. Anything not in
 * the schema is dropped rather than stored, which means a crafted request
 * cannot inject extra keys into a page's content, and markup cannot be smuggled
 * into copy.
 *
 * Links are constrained to internal paths and a short list of safe schemes, so
 * an editor - or anyone who reached the form - cannot turn a call to action
 * into a `javascript:` URL.
 */

const MAX_LIST_ITEMS = 40;

/** Paths and absolute URLs on safe schemes only. Never javascript: or data:. */
function safeHref(raw: unknown, internalOnly: boolean): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '/';

  if (value.startsWith('/') && !value.startsWith('//')) return sanitiseText(value, 300);
  if (value.startsWith('#')) return sanitiseText(value, 120);
  if (internalOnly) return '/';

  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value) || /^tel:/i.test(value)) {
    return sanitiseText(value, 500);
  }
  return '/';
}

/**
 * Clean one value against its field.
 *
 * `sanitiseText` strips tags and control characters, which is belt-and-braces:
 * copy is rendered as React text or through the restricted markdown renderer,
 * neither of which can produce markup from a string. Stripping on the way in
 * keeps the stored data clean regardless of where it is later displayed.
 */
function cleanValue(field: FieldDef, raw: unknown): FieldValue {
  switch (field.type) {
    case 'text':
      return sanitiseText(typeof raw === 'string' ? raw : '', field.maxLength ?? 300);

    case 'textarea':
      return sanitiseText(typeof raw === 'string' ? raw : '', field.maxLength ?? 2000);

    case 'richtext': {
      // An editor document is rebuilt from its own whitelist: unknown nodes,
      // marks and attributes are dropped there rather than stored here.
      if (isRichTextDoc(raw)) return cleanRichTextDoc(raw);

      // Markdown keeps its newlines, so it is cleaned line by line rather than
      // through the single-line sanitiser.
      const source = typeof raw === 'string' ? raw : '';
      const cleaned = source
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => sanitiseText(line, 2000))
        .join('\n')
        .slice(0, field.maxLength ?? 20_000);
      return cleaned;
    }

    case 'link': {
      const value = (raw ?? {}) as Partial<LinkValue>;
      return {
        label: sanitiseText(typeof value.label === 'string' ? value.label : '', 80),
        href: safeHref(value.href, field.internalOnly ?? true),
      };
    }

    case 'image': {
      const value = (raw ?? {}) as Partial<ImageValue>;
      const src = typeof value.src === 'string' ? value.src.trim() : '';
      const safe =
        src.startsWith('/') || /^https?:\/\//i.test(src) ? sanitiseText(src, 500) : '';
      return { src: safe, alt: sanitiseText(typeof value.alt === 'string' ? value.alt : '', 200) };
    }

    case 'list': {
      if (!Array.isArray(raw)) return [];
      return raw.slice(0, field.maxItems ?? MAX_LIST_ITEMS).map((entry) => {
        const row: Record<string, string | LinkValue | ImageValue | RichTextDoc> = {};
        const source = (entry ?? {}) as Record<string, unknown>;
        // Only declared keys survive - anything else the client sent is dropped.
        for (const itemField of field.fields) {
          row[itemField.key] = cleanValue(itemField, source[itemField.key]) as
            | string
            | LinkValue
            | ImageValue
            | RichTextDoc;
        }
        return row;
      });
    }

    default:
      return '';
  }
}

export interface SavePageResult {
  ok: boolean;
  error?: string;
}

/**
 * The page behind a slug, whether it ships in code or was created here.
 *
 * Both kinds resolve to the same pair - a schema and a set of defaults - which
 * is what lets one editor, one validator and one save path serve both.
 */
async function editablePage(
  slug: string,
): Promise<{ definition: PageDef; isCustom: boolean } | null> {
  const registered = getRegisteredPage(slug);
  if (registered) return { definition: registered.definition, isCustom: false };

  const custom = await customPageService.getForAdmin(slug);
  if (custom) return { definition: customPageDefinition(custom), isCustom: true };

  return null;
}

function revalidateFor(definition: PageDef) {
  revalidatePath(definition.path);
  revalidatePath('/admin/pages');
  revalidatePath(`/admin/pages/${definition.slug}`);
  revalidatePath('/sitemap.xml');
}

/**
 * Save a page's content.
 *
 * `only` names the sections this form is responsible for, and is the reason
 * one page can be edited by two forms at once: the page's settings panel
 * holds SEO and the marketplace category, the content editor holds the copy,
 * and neither wipes the other's half. Without it the second form to save
 * would rebuild every section from what it submitted, which for the sections
 * it never showed is nothing - and nothing cleans to an empty string.
 *
 * Omitting it saves the whole page, which is what a single form means.
 */
export async function savePageContentAction(
  slug: string,
  submitted: unknown,
  only?: string[],
): Promise<SavePageResult> {
  const session = await requireAdminSession();

  const page = await editablePage(slug);
  if (!page) return { ok: false, error: 'That page does not exist.' };
  if (!submitted || typeof submitted !== 'object') {
    return { ok: false, error: 'Nothing to save.' };
  }

  const source = submitted as Record<string, unknown>;
  // Everything already saved, so the sections this form did not show survive
  // it. Read from the store rather than from the browser: a form cannot be
  // trusted to send back content it never displayed.
  const existing = await savedValues(slug, page.isCustom);
  const values: PageValues = {};

  for (const section of page.definition.sections) {
    if (only && !only.includes(section.key)) {
      const kept = existing[section.key];
      if (kept !== undefined) values[section.key] = kept;
      continue;
    }

    const sectionSource = (source[section.key] ?? {}) as Record<string, unknown>;
    const sectionValues: Record<string, FieldValue> = {};
    for (const field of section.fields) {
      sectionValues[field.key] = cleanValue(field, sectionSource[field.key]);
    }
    values[section.key] = sectionValues;
  }

  if (page.isCustom) {
    await customPageService.saveValues(slug, values, session.email);
  } else {
    await pageContentService.save(slug, values, session.email);
  }

  // The page itself, the admin list and the sitemap all reflect this.
  revalidateFor(page.definition);

  return { ok: true };
}

/** What has been saved for a page, whichever store holds it. */
async function savedValues(slug: string, isCustom: boolean): Promise<PageValues> {
  if (isCustom) {
    const custom = await customPageService.getForAdmin(slug);
    return custom?.values ?? {};
  }
  const record = await pageContentService.getOverrides(slug);
  return record?.values ?? {};
}

/**
 * Put a page's copy back to what shipped.
 *
 * `only` narrows it to the sections one form owns, for the same reason saving
 * takes it: a settings panel's reset must not take the page's copy with it.
 */
export async function resetPageContentAction(
  slug: string,
  only?: string[],
): Promise<SavePageResult> {
  const session = await requireAdminSession();

  const page = await editablePage(slug);
  if (!page) return { ok: false, error: 'That page does not exist.' };

  if (only) {
    const existing = await savedValues(slug, page.isCustom);
    const kept: PageValues = {};
    for (const [key, value] of Object.entries(existing)) {
      if (!only.includes(key)) kept[key] = value;
    }
    if (page.isCustom) {
      await customPageService.saveValues(slug, kept, session.email);
    } else {
      await pageContentService.save(slug, kept, session.email);
    }
    revalidateFor(page.definition);
    return { ok: true };
  }

  if (page.isCustom) {
    await customPageService.resetValues(slug, session.email);
  } else {
    await pageContentService.reset(slug);
  }

  revalidateFor(page.definition);
  return { ok: true };
}

// ------------------------------------------------------------- custom pages

export interface CreatePageResult extends SavePageResult {
  slug?: string;
}

/**
 * Create a page.
 *
 * The slug is the part that matters: it becomes a live URL, and a slug that
 * collides with a real route would produce a page nobody could reach, because
 * Next resolves static segments ahead of the dynamic one. `checkSlug` refuses
 * the reserved list, and the store is checked for an existing page, before
 * anything is written.
 */
export async function createPageAction(formData: FormData): Promise<CreatePageResult> {
  const admin = await requireAdminSession();

  const label = sanitiseText(String(formData.get('label') ?? ''), 80).trim();
  if (!label) return { ok: false, error: 'Give the page a name.' };

  const requested = String(formData.get('slug') ?? '').trim();
  const slug = slugify(requested || label);

  const check = checkSlug(slug);
  if (!check.ok) return { ok: false, error: check.error };

  if (!(await customPageService.isSlugAvailable(slug))) {
    return { ok: false, error: `A page already exists at /${slug}.` };
  }

  const description = sanitiseText(String(formData.get('description') ?? ''), 200).trim();

  // Checked against the templates that can actually be drawn, not trusted:
  // this is a server action endpoint like any other.
  const template = readTemplate(formData.get('template'));

  await customPageService.create(slug, {
    label,
    template,
    description:
      description ||
      (template === 'niche' ? `A niche landing page at /${slug}.` : `A service page at /${slug}.`),
    // New pages start as drafts. Publishing is a deliberate second action, so
    // an unfinished page is never briefly live.
    published: false,
  });

  /*
    The starting structure, if one was chosen.

    Sections are added one at a time because each needs its component's own
    defaults through the whitelist - and this runs once, when a page is
    created, so the count is a handful rather than a page's worth.

    The niche starter is the exception, and a deliberate one: it is the whole
    of a niche page, so it is built from that template's own starting copy
    rather than from nine components' separate defaults. A new page then opens
    reading like a page somebody began writing, not like a set of placeholders.
  */
  const starter = readStarter(formData.get('starter'), template);
  const written = new Set<string>();

  if (starter.sections.length > 0 && canConvert(template)) {
    for (const blueprint of blueprintFor(template, customPageDefaults(label, template))) {
      if (!starter.sections.includes(blueprint.component)) continue;
      written.add(blueprint.component);
      await pageSectionService.create({
        pageSlug: slug,
        component: blueprint.component,
        variant: blueprint.variant,
        values: blueprint.values,
        locked: blueprint.locked,
        updatedBy: admin.email,
      });
    }
  }

  for (const key of starter.sections) {
    if (written.has(key)) continue;
    const component = getComponent(key);
    if (!component) continue;
    await pageSectionService.create({
      pageSlug: slug,
      component: component.key,
      variant: component.variants[0]?.key ?? 'default',
      values: cleanSectionValues(component, component.defaults),
      locked: component.structural ?? false,
      updatedBy: admin.email,
    });
  }

  revalidatePath('/admin/pages');
  return { ok: true, slug };
}

/**
 * Copy a page into a new one.
 *
 * Reachable for any page, registered or custom, because the case worth having
 * is duplicating /gambling-link-building into a sports version - which is the
 * one page nobody can edit the shape of otherwise.
 */
export async function duplicatePageAction(formData: FormData): Promise<CreatePageResult> {
  const admin = await requireAdminSession();

  const from = String(formData.get('from') ?? '').trim();
  if (!from) return { ok: false, error: 'That page no longer exists.' };

  const label = sanitiseText(String(formData.get('label') ?? ''), 80).trim();
  if (!label) return { ok: false, error: 'Give the new page a name.' };

  const slug = slugify(String(formData.get('slug') ?? '').trim() || label);
  const check = checkSlug(slug);
  if (!check.ok) return { ok: false, error: check.error };

  const created = await customPageService.duplicate(from, {
    slug,
    label,
    updatedBy: admin.email,
  });
  if (!created) return { ok: false, error: 'That page could not be copied.' };

  revalidatePath('/admin/pages');
  return { ok: true, slug };
}

/** Rename a custom page, change its description, publish or unpublish it. */
export async function updatePageSettingsAction(
  slug: string,
  formData: FormData,
): Promise<SavePageResult> {
  const session = await requireAdminSession();

  const existing = await customPageService.getForAdmin(slug);
  if (!existing) return { ok: false, error: 'That page does not exist.' };

  const label = sanitiseText(String(formData.get('label') ?? ''), 80).trim();
  if (!label) return { ok: false, error: 'Give the page a name.' };

  const description = sanitiseText(String(formData.get('description') ?? ''), 200).trim();
  const published = formData.get('published') === 'on';

  await customPageService.updateSettings(
    slug,
    { label, description, published },
    session.email,
  );

  revalidateFor(customPageDefinition({ slug, label, description }));
  return { ok: true };
}

/**
 * Delete a custom page.
 *
 * Only custom pages can be deleted. A page that ships in code has no delete -
 * resetting it restores the shipped copy, which is the equivalent operation
 * and cannot leave the site with a dead link in its own navigation.
 */
export async function deletePageAction(slug: string): Promise<SavePageResult> {
  await requireAdminSession();

  const existing = await customPageService.getForAdmin(slug);
  if (!existing) return { ok: false, error: 'That page does not exist.' };

  await customPageService.delete(slug);

  revalidatePath(`/${slug}`);
  revalidatePath('/admin/pages');
  revalidatePath('/sitemap.xml');
  return { ok: true };
}
