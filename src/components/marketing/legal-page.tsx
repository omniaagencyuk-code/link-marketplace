import type { ReactNode } from 'react';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { RichText } from '@/lib/cms/rich-text-render';
import type { ContentAccessors } from '@/lib/cms/resolve';

/**
 * Shared layout for the legal documents.
 *
 * Deliberately plain: a narrow measure, generous line height and no marketing
 * furniture. Someone reading this is checking a specific clause, and the job
 * of the page is to let them find it.
 */
export function LegalPage({
  content,
  breadcrumbLabel,
  summary,
}: {
  content: ContentAccessors;
  breadcrumbLabel: string;
  /**
   * Rendered between the standfirst and the document, for the one thing on a
   * legal page that must not be editable copy: a figure the code enforces.
   * Only the refund policy passes one.
   */
  summary?: ReactNode;
}) {
  const updatedAt = content.text('page', 'updatedAt');
  const intro = content.text('page', 'intro');

  return (
    <section className="bg-white">
      <Container size="narrow" className="py-12 lg:py-16">
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-2 text-[12px] text-muted">
            <li>
              <Link href="/" className="hover:text-ink">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-ink-soft">{breadcrumbLabel}</li>
          </ol>
        </nav>

        <h1 className="text-[2rem] leading-tight font-semibold tracking-tight text-ink sm:text-4xl">
          {content.text('page', 'title')}
        </h1>

        {updatedAt ? (
          <p className="mt-3 text-[13px] text-muted">Last updated {updatedAt}</p>
        ) : null}

        {intro ? (
          <p className="mt-5 text-[16px] leading-relaxed text-muted">{intro}</p>
        ) : null}

        {summary}

        <div className="mt-10 border-t border-line pt-10">
          <RichText source={content.richText('page', 'body')} />
        </div>
      </Container>
    </section>
  );
}
