import fs from 'node:fs';
import path from 'node:path';
import Image from 'next/image';
import { ParrotIllustration } from '@/components/home/parrot-illustration';
import { cn } from '@/lib/utils/cn';

/**
 * The mascot on a niche landing page.
 *
 * Same arrangement as the homepage hero: a path is declared, and the drawn
 * parrot stands in until artwork appears at it. That is what makes the swap a
 * file drop rather than a code change - and it is why a missing file can never
 * render as a broken image on a page whose whole job is to look credible to a
 * stranger arriving from Google.
 *
 * The extensions are tried in order, so a `.webp` wins over a `.png` of the
 * same name without anyone editing this list.
 */
const EXTENSIONS = ['.webp', '.avif', '.png', '.svg'];

/**
 * The artwork's real size, for the space the browser reserves.
 *
 * The dimensions used to be two constants, correct for the first parrot
 * drawn and wrong for every one after it. A picture that is 1374 wide
 * declared as 1263 does not render wrong - `h-auto w-full` governs that -
 * but the browser holds the wrong shaped gap for it, and the page jumps when
 * it arrives. On a landing page whose whole job is to look credible to a
 * stranger, that jump is the first thing they see.
 *
 * Read from the file, so the next parrot needs no edit here either. Falls
 * back to the drawn parrot's shape when the header cannot be read, which
 * puts us exactly where we were before rather than anywhere worse.
 */
const FALLBACK_SIZE = { width: 1263, height: 1246 };

function artworkSize(publicPath: string): { width: number; height: number } {
  try {
    const file = fs.readFileSync(path.join(process.cwd(), 'public', publicPath));

    // PNG: width and height are big-endian 32-bit, straight after the IHDR tag.
    const ihdr = file.indexOf('IHDR');
    if (ihdr > 0) {
      return { width: file.readUInt32BE(ihdr + 4), height: file.readUInt32BE(ihdr + 8) };
    }

    // WebP: three flavours, and they store the size in three different ways.
    const vp8x = file.indexOf('VP8X');
    if (vp8x > 0) {
      const at = vp8x + 12;
      return {
        width: file.readUIntLE(at, 3) + 1,
        height: file.readUIntLE(at + 3, 3) + 1,
      };
    }
    const vp8l = file.indexOf('VP8L');
    if (vp8l > 0) {
      const bits = file.readUInt32LE(vp8l + 9);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    const vp8 = file.indexOf('VP8 ');
    if (vp8 > 0) {
      return {
        width: file.readUInt16LE(vp8 + 14) & 0x3fff,
        height: file.readUInt16LE(vp8 + 16) & 0x3fff,
      };
    }
  } catch {
    // An unreadable file is not worth failing a landing page over.
  }

  return FALLBACK_SIZE;
}

function findArtwork(src: string): string | undefined {
  if (!src) return undefined;

  // An uploaded image is already somewhere real: it was chosen from the media
  // library, which only ever hands back a URL that exists. Probing the
  // filesystem for it would find nothing and quietly fall back to the drawn
  // parrot, which is the one failure that would look like the feature not
  // working.
  if (/^https?:\/\//i.test(src)) return src;

  // A path with an extension is taken at its word; a bare one is probed.
  const candidates = /\.[a-z0-9]+$/i.test(src)
    ? [src, ...EXTENSIONS.map((ext) => src.replace(/\.[a-z0-9]+$/i, ext))]
    : EXTENSIONS.map((ext) => `${src}${ext}`);

  return candidates.find((candidate) =>
    fs.existsSync(path.join(process.cwd(), 'public', candidate)),
  );
}

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
  const uploaded = Boolean(artwork && /^https?:\/\//i.test(artwork));
  // An uploaded image lives on another host, so there is no file to measure.
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
