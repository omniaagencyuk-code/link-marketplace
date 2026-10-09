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
 * The first attempt was one file covering the section at every width. It is
 * right on a desktop and it was wrong at 820px, which is the width worth
 * checking: the section there is taller than it is wide, `cover` zooms the
 * picture several times to fill it, and what landed was the parrot sliced
 * vertically by the viewport edge next to half a mug. Shifting the position
 * only moves which part is mangled, because the problem is the shape - a
 * 2.5:1 photograph has no crop that holds both the bird and somewhere to
 * put a headline once the frame is taller than it is wide.
 *
 * So the narrow one is not a crop. It is the same photograph with its own
 * sky continued upward: the scene sits in the bottom third of a 9:16 frame,
 * its top edge faded into a gradient sampled from the sky inside it, and the
 * two thirds above are where the headline goes. Built from the wide file by
 * `scripts/build-hero-art.mjs` rather than supplied separately, so there is
 * one photograph and the rest is derived - re-run it and both follow.
 *
 * 9:16 because a phone is near enough that to crop almost nothing, and a
 * tablet only trims sky off the top. Anchored to the bottom at both, so
 * whatever is lost is empty sky and never the bird.
 */

/** The full scene. Dropped in `public`, so a missing file never draws. */
const WIDE = '/images/parrots/home-hero.webp';

/**
 * The same photograph recomposed for a frame taller than it is wide: the
 * scene in the bottom third, its own sky continued above it.
 */
const PORTRAIT = '/images/parrots/home-hero-portrait.webp';

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
 * Tablet and phone: the recomposed photograph, behind the text as on desktop.
 *
 * `object-bottom`, so every width keeps the bird and loses only sky.
 *
 * The scrim is heavier here and runs top to bottom rather than left to
 * right, because at this width the copy is over the picture rather than
 * beside it. It clears before the bottom third, so the scene itself is not
 * washed out - what gets veiled is the sky the words are on.
 */
export function HeroBackdropNarrow() {
  if (!exists(PORTRAIT)) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden">
      <Image
        src={PORTRAIT}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-bottom"
      />

      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.86)_0%,rgba(255,255,255,0.8)_42%,rgba(255,255,255,0.35)_62%,rgba(255,255,255,0)_74%)]" />
    </div>
  );
}
