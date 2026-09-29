import fs from 'node:fs';
import path from 'node:path';

/**
 * Finding and measuring artwork that lives in `public`.
 *
 * Two components need this and they need it to agree: a path is declared in
 * the CMS, and the picture appears when a file turns up at it. That is what
 * makes new artwork a file drop rather than a code change, and it is why a
 * missing file falls back to something drawn rather than rendering as a
 * broken image on a page whose whole job is to look credible to a stranger
 * arriving from Google.
 *
 * Server-only: it reads the filesystem, so it belongs to components that
 * render on the server. Nothing here reaches the browser.
 */

/** Tried in order, so a `.webp` wins over a `.png` of the same name. */
const EXTENSIONS = ['.webp', '.avif', '.png', '.svg'];

/**
 * The shape to reserve when a file cannot be measured.
 *
 * The drawn parrot's, which is where the page was before the artwork
 * arrived - so an unreadable header puts us exactly there rather than
 * anywhere worse.
 */
export const FALLBACK_SIZE = { width: 1263, height: 1246 };

/**
 * The artwork's real size, for the space the browser reserves.
 *
 * The dimensions used to be two constants, correct for the first parrot
 * drawn and wrong for every one after it. A picture 1374 wide declared as
 * 1263 does not render wrong - `h-auto w-full` governs that - but the
 * browser holds the wrong shaped gap for it, and the page jumps when it
 * arrives. On a landing page, that jump is the first thing a visitor sees.
 */
export function artworkSize(publicPath: string): { width: number; height: number } {
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

/**
 * The file behind a declared path, or undefined when there is not one yet.
 *
 * An uploaded image is already somewhere real: it was chosen from the media
 * library, which only ever hands back a URL that exists. Probing the
 * filesystem for it would find nothing and quietly fall back, which is the
 * one failure that would look like the feature not working.
 */
export function findArtwork(src: string): string | undefined {
  if (!src) return undefined;
  if (/^https?:\/\//i.test(src)) return src;

  // A path with an extension is taken at its word; a bare one is probed.
  const candidates = /\.[a-z0-9]+$/i.test(src)
    ? [src, ...EXTENSIONS.map((ext) => src.replace(/\.[a-z0-9]+$/i, ext))]
    : EXTENSIONS.map((ext) => `${src}${ext}`);

  return candidates.find((candidate) =>
    fs.existsSync(path.join(process.cwd(), 'public', candidate)),
  );
}

/** True when the artwork lives on another host, so there is no file to measure. */
export function isUploaded(artwork: string | undefined): boolean {
  return Boolean(artwork && /^https?:\/\//i.test(artwork));
}
