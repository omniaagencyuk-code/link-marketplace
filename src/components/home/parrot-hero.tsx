import fs from 'node:fs';
import path from 'node:path';
import Image from 'next/image';
import { ParrotIllustration } from './parrot-illustration';
import { HandwrittenNote } from '@/components/shared/handwritten';
import { MonsteraLeaf, PalmFrond } from '@/components/shared/foliage';
import { artworkSize, findArtwork, isUploaded, FALLBACK_SIZE } from '@/lib/cms/artwork';

/**
 * Drop final mascot artwork at one of these paths and it replaces the drawn
 * placeholder automatically. Transparent background, roughly 4:5, ideally
 * under 200 KB.
 */
const MASCOT_CANDIDATES = [
  '/images/press-parrot-hero.webp',
  '/images/press-parrot-hero.avif',
  '/images/press-parrot-hero.png',
];

/** Resolved at build time, so a missing file can never render as a broken image. */
function findMascot() {
  return MASCOT_CANDIDATES.find((candidate) =>
    fs.existsSync(path.join(process.cwd(), 'public', candidate)),
  );
}

/**
 * The mascot, with its handwritten annotation.
 *
 * The note lives here rather than in the hero because its placement is tuned
 * against the artwork - it has to sit beside the bird's head at every width.
 * The text itself is editable and arrives as a prop; a blank value hides it.
 *
 * `src` names artwork chosen in the CMS. Left blank, the shipped mascot is
 * used, and if that is missing too the drawn parrot stands in - so the hero
 * is never a broken image whatever anybody has or has not uploaded.
 */
export function ParrotHero({
  annotation,
  src,
  alt = 'Press Parrot, a blue and gold macaw wearing sunglasses, perched on a branch',
}: {
  annotation?: string;
  src?: string;
  alt?: string;
}) {
  // Artwork chosen in the CMS wins; the shipped mascot is the fallback; the
  // drawn parrot is the fallback to that, so this is never a broken image.
  const chosen = src?.trim() ? findArtwork(src.trim()) : undefined;
  const mascot = chosen ?? findMascot();
  const uploaded = isUploaded(mascot);
  const size = mascot && !uploaded ? artworkSize(mascot) : FALLBACK_SIZE;

  return (
    <div className="relative flex items-end justify-center">
      {/* foliage, kept to the outer edge so the hero stays light */}
      <PalmFrond
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -bottom-2 hidden h-auto w-40 rotate-[170deg] opacity-[0.14] motion-safe:animate-[var(--animate-sway)] lg:block"
      />
      <MonsteraLeaf
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-4 -left-8 hidden h-auto w-24 opacity-[0.12] lg:block"
      />

      {/* soft pool of light under the bird */}
      <div
        aria-hidden="true"
        className="absolute inset-x-6 bottom-4 h-24 rounded-[50%] bg-accent-500/10 blur-2xl"
      />

      {annotation ? (
        <HandwrittenNote
          arrow="down-right"
          className="absolute top-2 -left-2 z-20 hidden w-32 -rotate-6 sm:block lg:top-0 lg:-left-8"
        >
          {annotation.split('\n').map((line, index) => (
            <span key={line || index} className="block">
              {line}
            </span>
          ))}
        </HandwrittenNote>
      ) : null}

      <div className="relative w-full max-w-[16rem] motion-safe:animate-[var(--animate-float)] sm:max-w-[19rem] lg:max-w-none">
        {mascot && uploaded ? (
          /* eslint-disable-next-line @next/next/no-img-element --
             An uploaded image comes from the media library, whose host is
             configured at build time. `next/image` throws when a host is not
             in its allow list, and that throw is a 500 on the homepage. */
          <img
            src={mascot}
            alt={alt}
            width={size.width}
            height={size.height}
            className="h-auto w-full drop-shadow-[0_18px_30px_rgba(11,27,43,0.16)]"
          />
        ) : mascot ? (
          <Image
            src={mascot}
            alt={alt}
            width={size.width}
            height={size.height}
            priority
            sizes="(max-width: 640px) 80vw, (max-width: 1024px) 50vw, 36vw"
            className="h-auto w-full drop-shadow-[0_18px_30px_rgba(11,27,43,0.16)]"
          />
        ) : (
          <ParrotIllustration className="drop-shadow-[0_18px_30px_rgba(11,27,43,0.16)]" />
        )}
      </div>
    </div>
  );
}
