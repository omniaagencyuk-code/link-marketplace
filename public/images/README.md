# Brand image assets

Two slots. Both are resolved at build time, so a missing file falls back to the
drawn version rather than rendering broken.

## press-parrot-logo.(svg|webp|png)

The header lockup: parrot mark plus the "Press Parrot" wordmark. When present
it replaces the inline mark and text **everywhere** the logo appears: site
header, footer, dashboard and admin sidebars, admin sign-in and the 404 page.

- Transparent background. It sits on white and very pale green surfaces.
- Rendered 44px tall; width follows the artwork's own aspect ratio.
- Currently 2098 x 749. If you replace it, update the width and height on the
  `<Image>` in `src/components/layout/logo.tsx` to match the new ratio.
- SVG is preferred and is checked first. Otherwise WebP, then PNG.
- Resolution order lives in `next.config.ts` (`LOGO_CANDIDATES`), because the
  logo renders inside client components that cannot read the filesystem.

## press-parrot-hero.(webp|avif|png)

The homepage mascot: the full macaw on a branch.

- Transparent background, so the bird can overlap the hero panels.
- Currently 1263 x 1246 (near square). Keep a similar ratio if you replace it:
  the width and height on the `<Image>` in `parrot-hero.tsx` must match, or the
  page shifts as the image loads.
- Keep it under ~200 KB. WebP at quality 80 is usually plenty; Next also
  re-encodes and serves responsive sizes automatically.
- Leave a little headroom above the crest and below the branch: the float
  animation moves it 10px.
- Resolution order lives in `src/components/home/parrot-hero.tsx`
  (`MASCOT_CANDIDATES`).

## parrots/gambling-parrot.(webp|avif|png|svg)

The mascot on /gambling-link-building: the same macaw, in sunglasses, holding
a hand of cards with a few chips beside it.

- Transparent background. It sits on the pale green hero wash.
- Near square, like the homepage mascot. The `<Image>` is declared 1263 x 1246
  and a very different ratio will shift the hero as it loads.
- Until a file exists at this path the drawn parrot stands in, so the page is
  never broken and never shows a missing image.
- The path is editable in the admin under Pages -> Gambling link building ->
  Hero -> Mascot artwork, so a differently named file needs no code change.

A second niche page would follow the same pattern: `parrots/<niche>-parrot`.

## Uploads versus committed files

Editorial pictures - anything inside page copy, and any image chosen through
a CMS image field - are uploaded in the admin (the **Library** button beside
an image field, or the image button in the rich text toolbar) and stored in
Supabase. They need no deployment and are not in this folder.

The files here are different: they are brand artwork the code reaches for by
name, resolved at build time. Those stay committed.

## Adding them

Drop the files in this folder using these exact names, commit and push. The
next deployment picks them up with no code change.

Watch the extension: a file saved as `press-parrot-hero.png.webp` will not be
found. The name must end in a single, real extension.
