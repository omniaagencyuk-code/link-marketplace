# Image assets

## press-parrot-hero.webp

The homepage mascot. Drop the artwork in this folder as
`press-parrot-hero.webp` (or `.avif` / `.png`) and the hero swaps it in
automatically, replacing the drawn placeholder in
`src/components/home/parrot-illustration.tsx`.

Guidance:

- Transparent background, so the bird can overlap the hero panels.
- Roughly 4:5 portrait, around 1240 x 1440 px for a sharp 2x render.
- Keep it under ~200 KB. WebP at quality 80 is usually plenty.
- Leave a little headroom above the crest and below the branch; the hero
  crops nothing, but the float animation moves it 10px.

No other file needs to change. The lookup lives in
`src/components/home/parrot-hero.tsx` (`MASCOT_CANDIDATES`).
