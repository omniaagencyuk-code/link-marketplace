import { Link2, Newspaper, PenLine, Search, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { categoryName } from '@/lib/config/blog';
import { cn } from '@/lib/utils/cn';
import type { BlogPost, PostCategorySlug } from '@/lib/types/blog';

/**
 * The picture at the top of an article card.
 *
 * A post's own cover image when it has one, and a drawing of its category
 * when it does not - which at the time of writing is every one of them, so
 * the fallback is the normal case rather than the exception. A grey box with
 * a broken-image icon is what a listing looks like when nobody thought about
 * this, and a stock photograph of a laptop is what it looks like when
 * somebody thought about it for a minute.
 *
 * So the fallback is built rather than fetched: a wash in the brand's green,
 * the category's own mark, and its name. It costs no request, it cannot
 * 404, it is sharp at any size, and it says something true about the article
 * underneath it.
 *
 * Every cover keeps a 16:9 box whichever it draws, because a grid of cards
 * whose images are different heights is a grid that reflows as the images
 * arrive.
 */

const MARKS: Record<PostCategorySlug, LucideIcon> = {
  'link-building': Link2,
  'digital-pr': Newspaper,
  seo: Search,
  content: PenLine,
  'agency-growth': TrendingUp,
};

/**
 * A different wash per category, so a row of fallbacks reads as five things
 * rather than five copies of one thing. All within the one accent ramp:
 * five unrelated hues would be a second palette nobody chose.
 */
const WASHES: Record<PostCategorySlug, string> = {
  'link-building':
    'radial-gradient(22rem 14rem at 18% 12%, rgba(16,185,129,0.30) 0%, transparent 70%), linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
  'digital-pr':
    'radial-gradient(22rem 14rem at 82% 16%, rgba(16,185,129,0.26) 0%, transparent 70%), linear-gradient(135deg, #f0fdf4 0%, #cdeee0 100%)',
  seo: 'radial-gradient(20rem 13rem at 50% 0%, rgba(16,185,129,0.24) 0%, transparent 72%), linear-gradient(135deg, #ecfdf5 0%, #c9ebdf 100%)',
  content:
    'radial-gradient(22rem 15rem at 14% 84%, rgba(16,185,129,0.28) 0%, transparent 70%), linear-gradient(135deg, #f3fdf8 0%, #d6f2e5 100%)',
  'agency-growth':
    'radial-gradient(22rem 14rem at 86% 84%, rgba(16,185,129,0.26) 0%, transparent 70%), linear-gradient(135deg, #eefcf5 0%, #cceade 100%)',
};

export function PostCover({
  post,
  className,
  priority = false,
  showMark = true,
}: {
  post: BlogPost;
  className?: string;
  /**
   * The one cover above the fold. Everything else is lazy, which is most of
   * them: a page of nine cards should not fetch nine images before the
   * reader has scrolled to any of them.
   */
  priority?: boolean;
  /**
   * Whether the fallback draws its mark and the category's name.
   *
   * On a card, yes: there is nothing over the cover and the mark is what
   * makes a drawn cover look deliberate. On the featured card, no - it lays
   * its own title and excerpt across the cover, and the mark first showed
   * through the scrim behind the words and then, moved out of their way,
   * sat beside a badge saying much the same thing. The wash alone is the
   * backdrop that card wants; its category is printed as a badge instead.
   */
  showMark?: boolean;
}) {
  const Mark = MARKS[post.category] ?? Link2;
  const name = categoryName(post.category);

  return (
    <div
      className={cn(
        'relative aspect-[16/9] overflow-hidden bg-surface-sunken',
        className,
      )}
    >
      {post.coverImage?.src ? (
        /* eslint-disable-next-line @next/next/no-img-element --
           editor-supplied paths, including external ones, which the image
           optimiser would reject without a configured remote pattern. The
           alt text is the editor's and is kept as written. */
        <img
          data-pp-cover=""
          src={post.coverImage.src}
          alt={post.coverImage.alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        /*
          Decoration, not a picture of anything: the category is printed
          beside it on the card and read out there, so a screen reader
          hearing this twice would be hearing it twice.
        */
        <div
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundImage: WASHES[post.category] ?? WASHES['link-building'] }}
        >
          {showMark ? (
            <span className="flex flex-col items-center gap-2 text-accent-800">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/70 bg-white/70 shadow-[var(--shadow-card)]">
                <Mark className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-semibold tracking-[0.14em] uppercase">{name}</span>
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
