import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { categoryName } from '@/lib/config/blog';
import { readingTime } from '@/lib/cms/markdown';
import { PostCover } from './cover';
import { cn } from '@/lib/utils/cn';
import type { BlogPost } from '@/lib/types/blog';

/**
 * An article in the resources grid.
 *
 * The card the index is built from. `PostCard` still draws the article
 * page's "what to read next" row and the niche landing pages, and is
 * untouched - this one is the index's own, because the index wants a cover
 * on every card and a shape that tiles, and `PostCard` is deliberately
 * designed to look right without a cover.
 *
 * Nothing here is written: the title, the excerpt, the category and the date
 * are the post's, and the reading time is counted from its body the way it
 * always has been. A card shortens nothing - an excerpt is what an editor
 * wrote to be shown here, and a title cut off mid-phrase is a title that
 * says something its author did not.
 */
export function ArticleCard({
  post,
  priority = false,
  className,
  headingLevel: Heading = 'h3',
}: {
  post: BlogPost;
  priority?: boolean;
  className?: string;
  /** The grid sits under an h2, so its cards are h3s. */
  headingLevel?: 'h2' | 'h3';
}) {
  const href = `/resources/${post.slug}`;

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-1 hover:border-accent-200 hover:shadow-[var(--shadow-pop)]',
        className,
      )}
    >
      <PostCover post={post} priority={priority} />

      {/* The badge sits on the cover, as the design has it, rather than in
          the body where it would push the title down by a line. */}
      <span className="absolute top-3 left-3 inline-flex rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em] text-accent-800 uppercase shadow-[var(--shadow-card)]">
        {categoryName(post.category)}
      </span>

      <div className="flex flex-1 flex-col p-5">
        <Heading className="text-[16px] leading-snug font-semibold tracking-tight text-ink">
          {/*
            The whole card is the link: the overlay covers it, so a click
            anywhere lands on the article, and what a screen reader announces
            is still just the title.
          */}
          <Link href={href} className="after:absolute after:inset-0 group-hover:text-accent-700">
            {post.title}
          </Link>
        </Heading>

        <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">{post.excerpt}</p>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {readingTime(post.body)}
          </span>
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-accent-700 transition-all duration-200 group-hover:border-accent-200 group-hover:bg-accent-50 group-hover:translate-x-0.5"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * The one article the hero leads with.
 *
 * Bigger, and the only cover on the page that is not lazy - it is the
 * largest thing above the fold, so it is the one the browser should fetch
 * first rather than last.
 */
export function FeaturedArticleCard({ post }: { post: BlogPost }) {
  const href = `/resources/${post.slug}`;

  return (
    <article className="group relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-pop)] transition-all duration-200 hover:border-accent-200">
      <PostCover post={post} priority showMark={false} className="aspect-[16/10]" />

      {/* The copy sits over the foot of the image, as the design has it. The
          scrim is what keeps it readable over a photograph an editor
          uploaded, which could be any colour at all. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-950/35 to-transparent"
      />

      <div className="absolute inset-x-0 bottom-0 p-6 lg:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-accent-600 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-white uppercase">
            Featured article
          </span>
          {/* The category, which the cover no longer draws here. */}
          <span className="inline-flex rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-white uppercase">
            {categoryName(post.category)}
          </span>
        </div>

        <h2 className="mt-3 text-[1.35rem] leading-snug font-semibold tracking-tight text-white sm:text-2xl">
          <Link href={href} className="after:absolute after:inset-0">
            {post.title}
          </Link>
        </h2>

        <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-white/80">{post.excerpt}</p>

        <div className="mt-4 flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-white/80">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {readingTime(post.body)}
          </span>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-accent-700 transition-transform duration-200 group-hover:translate-x-1"
          >
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </article>
  );
}
