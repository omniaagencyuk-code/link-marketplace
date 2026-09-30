import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { PageEditor } from '@/components/admin/cms/page-editor';
import { CustomPageSettings } from '@/components/admin/cms/custom-page-settings';
import { MockStorageNotice } from '@/components/admin/mock-storage-notice';
import { getRegisteredPage } from '@/lib/cms/registry';
import { customPageDefaults, customPageDefinition } from '@/lib/cms/custom-page';
import { pageContentService } from '@/lib/services/page-content-service';
import { customPageService } from '@/lib/services/custom-page-service';
import { pageSectionService } from '@/lib/services/page-section-service';
import { SectionList } from '@/components/admin/cms/section-list';
import type { PageSection } from '@/lib/cms/sections';

export const dynamic = 'force-dynamic';

export default async function EditPagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // A page that ships in code and a page created here are edited through the
  // same form - only where the schema and defaults come from differs.
  const registered = getRegisteredPage(slug);

  if (registered) {
    const [saved, sections] = await Promise.all([
      pageContentService.getOverrides(slug),
      pageSectionService.allForPage(slug),
    ]);

    return (
      <>
        <BackLink />
        <PageTitle title={registered.definition.label} description={registered.definition.description} />
        <MockStorageNotice what="Page edits" />
        <Sections slug={slug} sections={sections} />
        <PageEditor
          definition={registered.definition}
          defaults={registered.defaults}
          saved={saved?.values ?? {}}
          updatedAt={saved?.updatedAt}
          updatedBy={saved?.updatedBy}
        />
      </>
    );
  }

  const [custom, sections] = await Promise.all([
    customPageService.getForAdmin(slug),
    pageSectionService.allForPage(slug),
  ]);
  if (!custom) notFound();

  return (
    <>
      <BackLink />
      <PageTitle title={custom.label} description={custom.description} />
      <MockStorageNotice what="Page edits" />

      <CustomPageSettings
        slug={custom.slug}
        label={custom.label}
        description={custom.description}
        published={custom.published}
      />

      <div className="mt-6">
        <Sections slug={slug} sections={sections} />
      </div>

      <div className="mt-6">
        <PageEditor
          definition={customPageDefinition(custom)}
          defaults={customPageDefaults(custom.label)}
          saved={custom.values}
          updatedAt={custom.updatedAt}
        />
      </div>
    </>
  );
}

/**
 * The sections panel, above the page's own fields.
 *
 * Both kinds of page get it - one registered in code and one created here are
 * the same object as far as sections are concerned, and the point of this is
 * that a page's shape stops being a property of which kind it is.
 *
 * While a page has no sections it still renders from code, which the empty
 * state says. That is how a page moves across: build its sections, compare the
 * two renders, and only then retire the code.
 */
function Sections({ slug, sections }: { slug: string; sections: PageSection[] }) {
  return (
    <section className="mb-6" aria-labelledby="sections-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sections-heading" className="text-[15px] font-semibold text-ink">
          Sections
        </h2>
        <p className="text-[12px] text-muted">
          {sections.length === 0
            ? 'This page renders from code until it has sections.'
            : `${sections.length} ${sections.length === 1 ? 'section' : 'sections'}, top to bottom.`}
        </p>
      </div>
      <SectionList pageSlug={slug} sections={sections} />
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
