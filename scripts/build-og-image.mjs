/**
 * The card every share of this site shows.
 *
 * Built rather than drawn by hand, for the same reason `build-hero-art.mjs`
 * exists: an image somebody made once in a design tool and nobody can remake
 * is an image that goes stale the first time the tagline changes. Run:
 *
 *   node scripts/build-og-image.mjs
 *
 * It reads the brand's own colours, name, domain and tagline from
 * `src/lib/config/brand.ts` and the two existing assets, and writes
 * `src/app/opengraph-image.png`. Next's file convention picks that up and
 * emits `og:image` and `twitter:image` on every page, so there is nothing to
 * wire and nothing to remember on a new route.
 *
 * ## It needs Inter installed, which is why the output is committed
 *
 * The text is SVG, rendered by sharp through librsvg, which uses the system's
 * fonts. Inter is the site's own typeface; on a machine without it the card
 * renders in whatever the fallback is. So this is not run on deploy - the PNG
 * is committed, and this file is the record of how it was made. Look at the
 * result before committing a new one.
 *
 * 1200x630 is the size both Facebook and X crop least badly, and the one
 * every preview tool assumes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
const OUT = 'src/app/opengraph-image.png';
const ALT = 'src/app/opengraph-image.alt.txt';

/* Read from the brand file rather than retyped here. A tagline in two places
   is a tagline that disagrees with itself within a month. */
const brandSource = readFileSync('src/lib/config/brand.ts', 'utf8');
const field = (name) => {
  const match = brandSource.match(new RegExp(`\\n  ${name}: '([^']*)'`));
  if (!match) throw new Error(`Could not read "${name}" from brand.ts`);
  return match[1];
};

const name = field('name');
const domain = field('domain');
const tagline = field('tagline');

const INK = '#0b1b2b';
const MUTED = '#64748b';
const ACCENT = '#10b981';
const ACCENT_50 = '#ecfdf5';

/* The same pale wash the marketing pages wear, so a share looks like the page
   it links to rather than like a different site. */
const background = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <radialGradient id="wash" cx="0.86" cy="-0.08" r="0.95">
      <stop offset="0%" stop-color="${ACCENT_50}" stop-opacity="1"/>
      <stop offset="60%" stop-color="${ACCENT_50}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#wash)"/>
  <rect y="${HEIGHT - 10}" width="${WIDTH}" height="10" fill="${ACCENT}"/>
</svg>`);

/*
  Wrapped by width, not down the middle.

  Splitting the tagline in half put "The link building marketplace" on one
  line, which at this size runs into the parrot. The headline has about 620px
  before it does, and 44px Inter averages close enough to 19px a character to
  pick the break from the count alone.
*/
function wrap(sentence, maxChars) {
  const lines = [];
  let line = '';
  for (const word of sentence.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const wrapped = wrap(tagline, 30);
if (wrapped.length > 3) {
  throw new Error(
    `The tagline needs ${wrapped.length} lines and there is room for three. Shorten it, or drop the size in this file and look at the result.`,
  );
}

const HEADLINE_TOP = 318;
const HEADLINE_STEP = 56;

const text = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <style>
    .headline { font-family: 'Inter'; font-weight: 600; font-size: 44px; fill: ${INK}; letter-spacing: -0.8px; }
    .sub { font-family: 'Inter'; font-weight: 400; font-size: 25px; fill: ${MUTED}; }
    .domain { font-family: 'Inter'; font-weight: 600; font-size: 23px; fill: ${ACCENT}; letter-spacing: 0.4px; }
  </style>
  ${wrapped
    .map(
      (line, index) =>
        `<text x="76" y="${HEADLINE_TOP + index * HEADLINE_STEP}" class="headline">${line}</text>`,
    )
    .join('\n  ')}
  <text x="76" y="${HEADLINE_TOP + wrapped.length * HEADLINE_STEP + 14}" class="sub">Guest posts &#183; Niche edits &#183; Digital PR</text>
  <text x="76" y="546" class="domain">${domain}</text>
</svg>`);

/* The lockup carries the wordmark, so the card never spells the name in a
   font the logo does not use. */
const logo = await sharp('public/images/press-parrot-logo.webp')
  .resize({ width: 420 })
  .toBuffer();

/* Sized and placed so the headline keeps its clear width. The text
   composites last, so an overlap would draw over the bird rather than behind
   it - legible, and untidy. */
const parrot = await sharp('public/images/press-parrot-hero.webp')
  .resize({ height: 436 })
  .toBuffer();
const parrotMeta = await sharp(parrot).metadata();

await sharp(background)
  .composite([
    { input: parrot, left: WIDTH - parrotMeta.width - 40, top: 104 },
    { input: logo, left: 76, top: 158 },
    { input: text, left: 0, top: 0 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(OUT);

writeFileSync(ALT, `${name} - ${tagline}\n`);

const written = await sharp(OUT).metadata();
console.log(`${OUT}  ${written.width}x${written.height}`);
console.log(`${ALT}  "${name} - ${tagline}"`);
