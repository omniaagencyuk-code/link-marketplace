import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { PageEditor } from '@/components/admin/cms/page-editor';
import { CustomPageSettings } from '@/components/admin/cms/custom-page-settings';
import { ConvertPage } from '@/components/admin/cms/convert-page';
import { MockStorageNotice } from '@/components/admin/mock-storage-notice';
import { AdminLoadError } from '@/components/admin/load-error';
import { getRegisteredPage } from '@/lib/cms/registry';
import { customPageDefaults, customPageDefinition, readTemplate } from '@/lib/cms/custom-page';
import { pageContentService } from '@/lib/services/page-content-service';
import { customPageService } from '@/lib/services/custom-page-service';
import { pageSectionService } from '@/lib/services/page-section-service';
import { canConvert } from '@/lib/cms/migrate/page-to-sections';
import { SectionList } from '@/components/admin/cms/section-list';
import type { GlobalSection, PageSection } from '@/lib/cms/sections';
import type { PageDef, PageValues } from '@/lib/cms/types';

export const dynamic = 'force-dynamic';

/**
 * One page, edited in one place.
 *
 * The screen is four blocks, top to bottom, and the order is the order an
 * editor thinks in:
 *
 *   PAGE      what this page is - its name, its path, its status
 *   SEO       how it appears in search results and when shared
 *   MARKETPLACE  which part of the marketplace it is an entry point to
 *   SECTIONS  what is actually on it, in the order it is on it
 *
 * The first three are settings, not sections, and they are edited by a form
 * narrowed to those keys. That narrowing is the reason two forms can edit one
 * page without blanking each other: each save names the sections it owns.
 *
 * ## The template editor
 *
 * A page that has not been converted yet still renders from its template, so
 * its copy is still what the public sees and it is still edited here. A page
 * that *has* been converted renders from its sections, and the template's
 * fields are then history - kept, because the conversion is reversible and
 * throwing the source away would make it not be, but folded away and labelled
 * so nobody edits a field that changes nothing.
 */

/** The settings blocks, in the order they are shown. Never sections. */
const SETTINGS_KEYS = ['seo', 'marketplace'];

export default async function EditPagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // A page that ships in code and a page created here are edited through the
  // same form - only where the schema and defaults come from differs.
  const registered = getRegisteredPage(slug);

  if (registered) {
    /*
      Caught here rather than left to Next, which redacts a server error's
      message in production and renders a grey box reading "A server error
      occurred". Correct for a stranger; useless for the only people who can
      see this page, all of whom are administrators by the time they do.

      The page still fails. What changes is that it says what failed.
    */
    let loaded;
    try {
      loaded = await Promise.all([
        pageContentService.getOverrides(slug),
        pageSectionService.allForPage(slug),
        pageSectionService.listGlobals(),
      ]);
    } catch (error) {
      return (
        <div className="space-y-4">
          <PageTitle title={registered.definition.label} description="" />
          <AdminLoadError what="This page's sections" error={error} />
        </div>
      );
    }
    const [saved, sections, globals] = loaded;

    return (
      <Editor
        slug={slug}
        definition={registered.definition}
        defaults={registered.defaults}
        saved={saved?.values ?? {}}
        updatedAt={saved?.updatedAt}
        updatedBy={saved?.updatedBy}
        template={registered.definition.template ?? 'service'}
        sections={sections}
        globals={globals}
        title={registered.definition.label}
        description={registered.definition.description}
      />
    );
  }

  let loaded;
  try {
    loaded = await Promise.all([
      customPageService.getForAdmin(slug),
      pageSectionService.allForPage(slug),
      pageSectionService.listGlobals(),
    ]);
  } catch (error) {
    return (
      <div className="space-y-4">
        <PageTitle title="Page" description="" />
        <AdminLoadError what="This page's sections" error={error} />
      </div>
    );
  }
  const [custom, sections, globals] = loaded;
  if (!custom) notFound();

  const template = readTemplate(custom.template);

  return (
    <Editor
      slug={slug}
      definition={customPageDefinition(custom)}
      defaults={customPageDefaults(custom.label, template)}
      saved={custom.values}
      updatedAt={custom.updatedAt}
      template={template}
      sections={sections}
      globals={globals}
      title={custom.label}
      description={custom.description}
      settings={
        <CustomPageSettings
          slug={custom.slug}
          label={custom.label}
          description={custom.description}
          published={custom.published}
        />
      }
    />
  );
}

function Editor({
  slug,
  definition,
  defaults,
  saved,
  updatedAt,
  updatedBy,
  template,
  sections,
  globals,
  title,
  description,
  settings,
}: {
  slug: string;
  definition: PageDef;
  defaults: PageValues;
  saved: PageValues;
  updatedAt?: string;
  updatedBy?: string;
  template: string;
  sections: PageSection[];
  globals: GlobalSection[];
  title: string;
  description: string;
  /** The page's own settings, for a page created here. */
  settings?: React.ReactNode;
}) {
  const settingsDef = narrow(definition, (key) => SETTINGS_KEYS.includes(key));
  const contentDef = narrow(definition, (key) => !SETTINGS_KEYS.includes(key));
  const built = sections.length > 0;

  return (
    <>
      <BackLink />
      <PageTitle title={title} description={description} />
      <MockStorageNotice what="Page edits" />

      {settings ? <div className="mb-6">{settings}</div> : null}

      {/* SEO, and the marketplace category the sections all read. Page-level
          on purpose: the preview, the count and every link out are about the
          same category, so it is set once here rather than in each of them. */}
      {settingsDef.sections.length ? (
        <div className="mb-8">
          <PageEditor
            definition={settingsDef}
            defaults={defaults}
            saved={saved}
            updatedAt={updatedAt}
            updatedBy={updatedBy}
            summary={!settings}
          />
        </div>
      ) : null}

      <Sections slug={slug} sections={sections} globals={globals} />

      {!built && canConvert(template) ? (
        <div className="mb-8">
          <ConvertPage pageSlug={slug} template={template} />
        </div>
      ) : null}

      {contentDef.sections.length ? (
        built ? (
          /* Converted. These fields no longer reach the page, and saying so
             here is cheaper than an editor discovering it by typing into one.
             Kept rather than deleted, because that is what makes the
             conversion reversible. */
          <details className="rounded-[var(--radius-card)] border border-line bg-white px-5 py-4 shadow-[var(--shadow-card)]">
            <summary className="cursor-pointer text-[14px] font-semibold text-ink">
              Template content - no longer rendered
            </summary>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
              This page renders from the sections above. These are the fields it used before it
              was converted, kept so the conversion can be undone - delete every section and the
              page renders from them again. Editing them changes nothing while sections exist.
            </p>
            <div className="mt-5">
              <PageEditor
                definition={contentDef}
                defaults={defaults}
                saved={saved}
                updatedAt={updatedAt}
                updatedBy={updatedBy}
                summary={false}
              />
            </div>
          </details>
        ) : (
          <PageEditor
            definition={contentDef}
            defaults={defaults}
            saved={saved}
            updatedAt={updatedAt}
            updatedBy={updatedBy}
            summary={false}
          />
        )
      ) : null}
    </>
  );
}

/** The same page, showing only some of its sections. */
function narrow(definition: PageDef, keep: (key: string) => boolean): PageDef {
  const sections = definition.sections.filter((section) => keep(section.key));
  return {
    ...definition,
    sections: SETTINGS_KEYS.some((key) => sections.some((section) => section.key === key))
      ? // Search first, then the marketplace category: the order the brief
        // asks for, which is not the order either schema declares them in.
        [...sections].sort((a, b) => SETTINGS_KEYS.indexOf(a.key) - SETTINGS_KEYS.indexOf(b.key))
      : sections,
  };
}

/**
 * The sections panel: what is on the page, in the order it is on it.
 *
 * Both kinds of page get it - one registered in code and one created here are
 * the same object as far as sections are concerned, and the point of this is
 * that a page's shape stops being a property of which kind it is.
 */
function Sections({
  slug,
  sections,
  globals,
}: {
  slug: string;
  sections: PageSection[];
  globals: GlobalSection[];
}) {
  return (
    <section className="mb-8" aria-labelledby="sections-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sections-heading" className="text-[15px] font-semibold text-ink">
          Sections
        </h2>
        <p className="text-[12px] text-muted">
          {sections.length === 0
            ? 'This page renders from its template until it has sections.'
            : `${sections.length} ${sections.length === 1 ? 'section' : 'sections'}, top to bottom. This is what the page is.`}
        </p>
      </div>
      <SectionList pageSlug={slug} sections={sections} globals={globals} />
    </section>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/pages"
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      All pages
    </Link>
  );
}
