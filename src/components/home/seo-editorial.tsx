import { Container } from '@/components/layout/container';
import { RichText, type RichTextValue } from '@/lib/cms/rich-text-render';
import type { ContentAccessors } from '@/lib/cms/resolve';

/**
 * The editorial section.
 *
 * Substantial public content about link building, laid out as a set of short
 * readable articles with a sticky contents list rather than a wall of text.
 * Internal links inside the markdown are what tie the homepage to the service
 * pages, so they are worth an editor's attention.
 */
export function SeoEditorial({ content }: { content: ContentAccessors }) {
  const articles = content.list<{ id: string; heading: string; content: RichTextValue }>(
    'editorial',
    'articles',
  );
  if (!articles.length) return null;

  return (
    <section className="border-b border-line bg-white" aria-labelledby="editorial-heading">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
            {content.text('editorial', 'eyebrow')}
          </p>
          <h2
            id="editorial-heading"
            className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
          >
            {content.text('editorial', 'heading')}
          </h2>
        </div>

        <div className="mt-11 grid gap-10 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-16">
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <h3 className="text-[12px] font-semibold tracking-wide text-muted uppercase">
              On this page
            </h3>
            <ol className="mt-4 space-y-2.5 border-l border-line pl-4">
              {articles.map((article, index) => (
                <li key={article.id || index}>
                  <a
                    href={`#${article.id}`}
                    className="text-[13px] leading-snug text-muted transition-colors hover:text-accent-700"
                  >
                    {article.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0 max-w-2xl space-y-11">
            {articles.map((article, index) => (
              <article key={article.id || index} id={article.id} className="scroll-mt-24">
                <h3 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                  {article.heading}
                </h3>
                <div className="mt-4">
                  <RichText source={article.content} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
