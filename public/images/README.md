# Brand image assets

Two slots. Both are resolved at build time, so a missing file falls back to the
drawn version rather than rendering broken.

## press-parrot-logo.(svg|webp|png)

The header lockup: parrot mark plus the "Press Parrot" wordmark. When present
it replaces the inline mark and text **everywhere** the logo appears: site
header, footer, dashboard and admin sidebars, admin sign-in and the 404 page.

- Transparent background. It sits on white and very pale green surfaces.
- Rendered at 32px tall; width follows the artwork's own aspect ratio.
- Supply at 3x for sharpness, so roughly 100px tall for a 2.7:1 lockup.
- SVG is preferred and is checked first. Otherwise WebP, then PNG.
- Resolution order lives in `next.config.ts` (`LOGO_CANDIDATES`), because the
  logo renders inside client components that cannot read the filesystem.

## press-parrot-hero.(webp|avif|png)

The homepage mascot: the full macaw on a branch.

- Transparent background, so the bird can overlap the hero panels.
- Roughly 4:5 portrait, around 1240 x 1440 px for a sharp 2x render.
- Keep it under ~200 KB. WebP at quality 80 is usually plenty; Next also
  re-encodes and serves responsive sizes automatically.
- Leave a little headroom above the crest and below the branch: the float
  animation moves it 10px.
- Resolution order lives in `src/components/home/parrot-hero.tsx`
  (`MASCOT_CANDIDATES`).

## Adding them

Drop the files in this folder using these exact names, commit and push. The
next deployment picks them up with no code change.
