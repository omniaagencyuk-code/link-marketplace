import fs from 'node:fs';
import path from 'node:path';
import Image from 'next/image';

/**
 * The homepage hero's photograph, in the two shapes it is needed in.
 *
 * A wide scene - macaw, laptop and coffee on the right, a coastline on the
 * left - which replaces the mascot column the hero used to have: with the
 * bird in the picture, a second drawn parrot beside it was two parrots.
 *
 * Decorative in both forms, so `alt` is empty and each is `aria-hidden`. It
 * says nothing the headline over it does not, and a screen reader announcing
 * a parrot before the `h1` is noise.
 *
 * ## Why two files rather than one picture positioned twice
 *
 * The first attempt was one file covering the section at every width, held
 * at 22% on narrow screens and right on wide ones. It is right on a desktop
 * and it was wrong at 820px, which is the width that matters most for
 * getting this sort of thing wrong: the section there is taller than it is
 * wide, `cover` zooms the picture by several times to fill it, and what
 * landed was the parrot sliced vertically by the viewport edge, half a mug
 * and a chair. Shifting the position only moves which part is mangled.
 *
 * So below `lg` the picture stops being a background. It becomes a band
 * under the copy, cropped to the right-hand portion where the subject is,
 * shown whole at its own shape. Nothing is behind the headline, nothing is
 * cut, and the text sits on plain white where it is guaranteed readable.
 */

/** The full scene. Dropped in `public`, so a missing file never draws. */
const WIDE = '/images/parrots/home-hero.webp';

/**
 * The same photograph cropped to its right-hand portion - bird, laptop, mug
 * and enough coast to keep the setting. Generated from the file above rather
 * than supplied separately, so there is one photograph and two framings of
 * it.
 */
const NARROW = '/images/parrots/home-hero-narrow.webp';

const exists = (file: string) => fs.existsSync(path.join(process.cwd(), 'public', file));

/**
 * Desktop: the photograph behind the whole section.
 *
 * The file is 2.5:1 and a desktop hero is near enough that to need almost no
 * crop, so it covers and sits hard right - the bird, the laptop and the mug
 * stay whole and land in the empty half of the layout, which is what the
 * composition was drawn for.
 *
 * The scrim is contrast, not decoration. Dark text on a photograph is
 * unreadable wherever the photograph is bright, and this one is bright
 * everywhere: sea, sky, white buildings. It is white at the left column and
 * gone by the middle, so the half holding the bird is the photograph and
 * nothing else.
 */
export function HeroBackdrop() {
  if (!exists(WIDE)) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
      {/*
        `priority`, because on a desktop this is the Largest Contentful Paint
        on the page a stranger judges the business by. `sizes="100vw"` is
        what tells the browser which generated width to actually fetch.
      */}
      <Image src={WIDE} alt="" fill priority sizes="100vw" className="object-cover object-right" />

      <div className="absolute inset-0 bg-[linear-gradient(to_right,#fff_0%,rgba(255,255,255,0.92)_28%,rgba(255,255,255,0.55)_45%,rgba(255,255,255,0)_62%)]" />

      {/* The section's own bottom edge, so the photograph meets the strip below it cleanly. */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-white" />
    </div>
  );
}

/**
 * Tablet and phone: the same photograph as a band beneath the copy.
 *
 * Not `priority`. On these widths the headline is the Largest Contentful
 * Paint and it sits above this, so fetching the picture first would delay
 * the thing being measured to deliver the thing below it.
 *
 * `sizes="100vw"` because it spans the viewport, and the intrinsic size is
 * declared so the browser reserves the right box before it loads - a band
 * that appears late and pushes the page down is the layout shift this
 * avoids.
 */
export function HeroBand() {
  if (!exists(NARROW)) return null;

  return (
    <div aria-hidden="true" className="relative lg:hidden">
      <Image
        src={NARROW}
        alt=""
        width={1223}
        height={793}
        sizes="100vw"
        className="h-auto w-full"
      />
      {/* A short fade at the top, so the picture meets the copy rather than butting against it. */}
      <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white to-transparent" />
    </div>
  );
}
