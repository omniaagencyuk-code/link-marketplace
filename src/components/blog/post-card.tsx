import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { categoryName } from '@/lib/config/blog';
import { readingTime } from '@/lib/cms/markdown';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { BlogPost } from '@/lib/types/blog';

/**
 * A post in a listing.
 *
 * `featured` gives the lead post a wider two-column treatment; everything else
 * uses the compact card. Cover images are optional, and the card is designed
 * to look deliberate without one rather than leaving a grey box.
 */
export function PostCard({ post, featured = false }: { post: BlogPost; featured?: boolean }) {
  const href = `/resources/${post.slug}`;

  return (
    <article
      className={cn(
        'group relative h-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]',
        featured && 'lg:grid lg:grid-cols-2 lg:items-stretch',
      )}
    >
      {post.coverImage?.src ? (
        <div className={cn('overflow-hidden bg-surface-sunken', featured ? 'lg:order-last' : '')}>
          {/* eslint-disable-next-line @next/next/no-img-element --
              editor-supplied paths, including external ones, which the image
              optimiser would reject without a configured remote pattern. */}
          <img
            src={post.coverImage.src}
            alt={post.coverImage.alt}
            className={cn('w-full object-cover', featured ? 'h-full min-h-56' : 'h-40')}
          />
        </div>
      ) : null}

      <div className={cn('flex h-full flex-col p-5', featured && 'lg:p-8')}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          <span className="font-medium text-accent-700">{categoryName(post.category)}</span>
          <span aria-hidden="true">&middot;</span>
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          <span aria-hidden="true">&middot;</span>
          <span>{readingTime(post.body)}</span>
        </div>

        <h2
          className={cn(
            'mt-3 font-semibold tracking-tight text-ink',
            featured ? 'text-xl sm:text-2xl' : 'text-[16px] leading-snug',
          )}
        >
          <Link href={href} className="after:absolute after:inset-0 group-hover:text-accent-700">
            {post.title}
          </Link>
        </h2>

        <p
          className={cn(
            'mt-2 flex-1 leading-relaxed text-muted',
            featured ? 'text-[15px]' : 'text-[13px]',
          )}
        >
          {post.excerpt}
        </p>

        <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-700">
          Read the guide
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
    </article>
  );
}
