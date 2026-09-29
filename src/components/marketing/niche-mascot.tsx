import Image from 'next/image';
import { ParrotIllustration } from '@/components/home/parrot-illustration';
import { artworkSize, findArtwork, isUploaded, FALLBACK_SIZE } from '@/lib/cms/artwork';
import { cn } from '@/lib/utils/cn';

/**
 * The mascot beside a niche landing page's headline.
 *
 * Same arrangement as the homepage hero: a path is declared, and the drawn
 * parrot stands in until artwork appears at it. See `@/lib/cms/artwork` for
 * the probing and measuring, which the hero banner shares.
 */
export function NicheMascot({
  src,
  alt,
  className,
}: {
  /** Where the artwork will live, e.g. /images/parrots/gambling-parrot.webp */
  src: string;
  alt: string;
  className?: string;
}) {
  const artwork = findArtwork(src);
  const uploaded = isUploaded(artwork);
  const size = artwork && !uploaded ? artworkSize(artwork) : FALLBACK_SIZE;

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      {/* A pool of light rather than a casino graphic: the theme comes from
          the bird, and the page still has to look like somewhere a serious
          buyer would spend money. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-8 bottom-6 h-28 rounded-[50%] bg-accent-500/10 blur-2xl"
      />

      <div className="relative w-full max-w-[15rem] motion-safe:animate-[var(--animate-float)] sm:max-w-[18rem] lg:max-w-none">
        {!artwork ? (
          <ParrotIllustration className="drop-shadow-[0_18px_30px_rgba(11,27,43,0.16)]" />
        ) : uploaded ? (
          /* eslint-disable-next-line @next/next/no-img-element --
             An uploaded image comes from the media library, whose host is
             configured at build time. `next/image` throws when a host is not
             in its allow list, and that throw is a 500 on a public landing
             page - too high a price for optimising one picture. A plain tag
             cannot fail that way. */
          <img
            src={artwork}
            alt={alt}
            width={size.width}
            height={size.height}
            className="h-auto w-full drop-shadow-[0_18px_30px_rgba(11,27,43,0.16)]"
          />
        ) : (
          <Image
            src={artwork}
            alt={alt}
            width={size.width}
            height={size.height}
            priority
            sizes="(max-width: 640px) 70vw, (max-width: 1024px) 45vw, 32vw"
            className="h-auto w-full drop-shadow-[0_18px_30px_rgba(11,27,43,0.16)]"
          />
        )}
      </div>
    </div>
  );
}
