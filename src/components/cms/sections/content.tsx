import Image from 'next/image';
import { Container } from '@/components/layout/container';
import { RichText, type RichTextValue } from '@/lib/cms/rich-text-render';
import { TableScroll } from '@/components/ui/table-scroll';
import { cn } from '@/lib/utils/cn';
import { link as linkOf, rows, str, type SectionProps } from './shared';

/**
 * Content sections: words, pictures, tables, and the long-form disclosure.
 *
 * All server components. The one piece of interactivity in here - expanding
 * the long content - is a native `<details>`, which needs no JavaScript and
 * is keyboard-operable for free.
 */

// -------------------------------------------------------------- text + image

export function TextImageSection({ values, variant }: SectionProps) {
  const body = values.body as RichTextValue | undefined;
  const image = valueImage(values, 'image');
  const heading = str(values, 'heading');
  if (!heading && !body && !image.src) return null;

  const textRight = variant === 'text-right';
  const full = variant === 'full-width' || !image.src;

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-14 lg:py-16">
        <div
          className={cn(
            'gap-10 lg:gap-14',
            full ? 'mx-auto max-w-2xl' : 'grid items-center lg:grid-cols-2',
          )}
        >
          <div className={cn('min-w-0', !full && textRight && 'lg:order-2')}>
            {heading ? (
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.875rem] sm:leading-tight">
                {heading}
              </h2>
            ) : null}
            {body ? (
              <div className={heading ? 'mt-4' : undefined}>
                <RichText source={body} variant="article" />
              </div>
            ) : null}
          </div>

          {!full && image.src ? (
            <div className={cn('min-w-0', textRight && 'lg:order-1')}>
              <SectionImage src={image.src} alt={image.alt} />
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

// -------------------------------------------------------------------- image

export function ImageSection({ values, variant }: SectionProps) {
  const image = valueImage(values, 'image');
  if (!image.src) return null;

  const caption = str(values, 'caption');
  const href = linkOf(values, 'link').href;

  const picture = <SectionImage src={image.src} alt={image.alt} />;

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-12 lg:py-14">
        <figure className={cn('mx-auto', variant === 'wide' ? 'max-w-none' : 'max-w-3xl')}>
          {href ? <a href={href}>{picture}</a> : picture}
          {caption ? (
            <figcaption className="mt-3 text-center text-[13px] text-muted">{caption}</figcaption>
          ) : null}
        </figure>
      </Container>
    </section>
  );
}

/**
 * A picture from the media library.
 *
 * Sized rather than filled, so the browser reserves the right shaped gap and
 * the page does not jump when it loads. Lazy below the fold and no `priority`
 * anywhere: a section in the middle of a page is never the largest paint, and
 * marking it priority would make it compete with whatever is.
 */
function SectionImage({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={1200}
      height={800}
      sizes="(min-width: 1024px) 50vw, 100vw"
      className="h-auto w-full rounded-[var(--radius-card)] border border-line"
    />
  );
}

// ------------------------------------------------------------- two columns

export function TwoColumnSection({ values }: SectionProps) {
  const left = values.left as RichTextValue | undefined;
  const right = values.right as RichTextValue | undefined;
  if (!left && !right) return null;

  const heading = str(values, 'heading');

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-14 lg:py-16">
        {heading ? (
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-ink sm:text-[1.875rem]">
            {heading}
          </h2>
        ) : null}
        <div className={cn('grid gap-10 lg:grid-cols-2 lg:gap-14', heading && 'mt-8')}>
          <div className="min-w-0">{left ? <RichText source={left} variant="article" /> : null}</div>
          <div className="min-w-0">{right ? <RichText source={right} variant="article" /> : null}</div>
        </div>
      </Container>
    </section>
  );
}

// -------------------------------------------------------------------- table

/**
 * An editorial table.
 *
 * Its own component rather than a table inside rich text, because a table is
 * the one thing that cannot simply be narrower on a phone: the columns have a
 * minimum width and the content is meaningless reflowed. So it scrolls
 * sideways inside its own box, with a bar at the top as well as the bottom -
 * the same component the admin's own wide tables use.
 */
export function TableSection({ values }: SectionProps) {
  const header = rows<{ label?: string }>(values, 'columns');
  const body = rows<{ cells?: string }>(values, 'rows');
  if (body.length === 0) return null;

  const heading = str(values, 'heading');

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-12 lg:py-14">
        <div className="mx-auto max-w-3xl">
          {heading ? (
            <h2 className="mb-5 text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
              {heading}
            </h2>
          ) : null}

          <TableScroll maxHeight="none">
            <table className="w-full min-w-[32rem] border-collapse text-left">
              {header.length ? (
                <thead>
                  <tr className="border-b border-line">
                    {header.map((column, index) => (
                      <th
                        key={column.label || index}
                        scope="col"
                        className="bg-surface px-4 py-2.5 text-[12px] font-semibold tracking-wide text-ink-soft uppercase"
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {body.map((row, index) => (
                  <tr key={index} className="border-b border-line last:border-0">
                    {/* One cell per column, split on a pipe. An editor typing a
                        row is typing a row, not filling in a form per cell. */}
                    {String(row.cells ?? '')
                      .split('|')
                      .map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-4 py-3 text-[14px] text-ink">
                          {cell.trim()}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      </Container>
    </section>
  );
}

// ------------------------------------------------------- expandable content

/**
 * Long content behind a disclosure.
 *
 * The whole point, and the thing that makes this worth building rather than
 * cutting the copy: **every word is in the server's response.** The hidden
 * part is not fetched on click - it is already in the HTML, inside a
 * `<details>` that starts closed. A crawler reads all of it; a reader sees an
 * introduction and a clearly labelled way to get the rest.
 *
 * `<details>` rather than a button and some state: it works without
 * JavaScript, it is keyboard-operable, screen readers announce it as a
 * disclosure, and browsers open it automatically when the reader uses
 * find-in-page on text inside it.
 */
export function ExpandableSection({ values }: SectionProps) {
  const intro = values.intro as RichTextValue | undefined;
  const more = values.more as RichTextValue | undefined;
  if (!intro && !more) return null;

  const heading = str(values, 'heading');
  const label = str(values, 'label') || 'Read more';

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-12 lg:py-16">
        <div className="mx-auto max-w-2xl">
          {heading ? (
            <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
              {heading}
            </h2>
          ) : null}

          {intro ? (
            <div className={heading ? 'mt-5' : undefined}>
              <RichText source={intro} variant="article" />
            </div>
          ) : null}

          {more ? (
            <details className="group mt-6">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[14px] font-medium text-accent-700 hover:underline">
                {label}
                <span aria-hidden="true" className="transition-transform group-open:rotate-180">
                  ↓
                </span>
              </summary>
              <div className="mt-5">
                <RichText source={more} variant="article" />
              </div>
            </details>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

function valueImage(values: Record<string, unknown>, key: string): { src: string; alt: string } {
  const raw = values[key];
  if (typeof raw !== 'object' || raw === null) return { src: '', alt: '' };
  const entry = raw as { src?: unknown; alt?: unknown };
  return {
    src: typeof entry.src === 'string' ? entry.src : '',
    alt: typeof entry.alt === 'string' ? entry.alt : '',
  };
}
