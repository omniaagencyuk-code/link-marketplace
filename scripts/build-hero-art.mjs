/**
 * The homepage hero's two derived images, built from the one photograph.
 *
 * The supplied file is 2.5:1 - a landscape scene with the macaw, laptop and
 * coffee on the right and a coastline on the left. A desktop hero is close
 * enough to that shape to use it directly. A phone is not, and no crop of a
 * 2.5:1 photograph holds both the bird and somewhere to put a headline once
 * the frame is taller than it is wide.
 *
 * So the narrow one is composed rather than cropped: the scene in the bottom
 * third of a 9:16 frame, its top edge faded into a gradient sampled from the
 * sky inside the photograph itself, and the two thirds above left as sky for
 * the copy to sit on.
 *
 * This exists so that is reproducible. Replace `source` with a new
 * photograph of roughly the same shape, run it, and both files follow -
 * rather than a pair of images somebody made by hand once and nobody can
 * remake. Run:  node scripts/build-hero-art.mjs [path-to-source]
 */
import { existsSync } from 'node:fs';
import { statSync } from 'node:fs';
import sharp from 'sharp';

const source = process.argv[2] ?? 'public/images/parrots/home-hero.webp';
const OUT_NARROW = 'public/images/parrots/home-hero-narrow.webp';
const OUT_PORTRAIT = 'public/images/parrots/home-hero-portrait.webp';

if (!existsSync(source)) {
  console.error(`No such file: ${source}`);
  process.exit(1);
}

const kb = (file) => `${Math.round(statSync(file).size / 1024)}KB`;

/** Mean colour of one region, as an `rgb()` string. */
async function sample(file, region) {
  const stats = await sharp(await sharp(file).extract(region).toBuffer()).stats();
  return `rgb(${stats.channels.slice(0, 3).map((c) => Math.round(c.mean)).join(',')})`;
}

const { width, height } = await sharp(source).metadata();

/*
  The right-hand portion: bird, laptop, mug and enough coast to keep the
  setting. Taken as a fraction rather than a pixel offset so a replacement
  photograph of a different size lands in the same place.
*/
const left = Math.round(width * 0.383);
await sharp(source)
  .extract({ left, top: 0, width: width - left, height })
  .webp({ quality: 82, effort: 6 })
  .toFile(OUT_NARROW);

const narrow = await sharp(OUT_NARROW).metadata();
console.log(`${OUT_NARROW}  ${narrow.width}x${narrow.height}  ${kb(OUT_NARROW)}`);

/*
  And the portrait frame. 9:16 because a phone crops almost nothing at that
  shape and a tablet only trims sky off the top; anchored to the bottom in
  the component, so whatever is lost is empty sky and never the bird.
*/
const W = 1080;
const H = 1920;
const PH = Math.round(narrow.height * (W / narrow.width));
const TOP = H - PH;
/** How far the photograph's top edge takes to appear out of the sky. */
const FEATHER = 300;

// Both ends sampled from sky only. Averaging the whole top edge would mix in
// the window frame on the right and give a muddy grey rather than a sky.
const skyTop = await sample(OUT_NARROW, { left: 40, top: 10, width: 300, height: 80 });
const skyMeets = await sample(OUT_NARROW, { left: 0, top: 0, width: 420, height: 40 });

const svg = (body, w, h) => Buffer.from(`<svg width="${w}" height="${h}">${body}</svg>`);

const sky = svg(
  `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${skyTop}"/><stop offset="100%" stop-color="${skyMeets}"/>` +
    `</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`,
  W,
  H,
);

// The photograph's top edge ramped to transparent, so it emerges from the
// sky rather than meeting it at a line. Its right-hand side is a window
// frame rather than sky, and fading that in reads as haze - which is the
// point: a hard join there would read as a collage.
const mask = svg(
  `<defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-opacity="0" stop-color="#fff"/>` +
    `<stop offset="${((FEATHER / PH) * 100).toFixed(1)}%" stop-opacity="1" stop-color="#fff"/>` +
    `</linearGradient></defs><rect width="100%" height="100%" fill="url(#m)"/>`,
  W,
  PH,
);

const faded = await sharp(OUT_NARROW)
  .resize(W)
  .ensureAlpha()
  .composite([{ input: await sharp(mask).toBuffer(), blend: 'dest-in' }])
  .png()
  .toBuffer();

await sharp(await sharp(sky).png().toBuffer())
  .composite([{ input: faded, top: TOP, left: 0 }])
  .webp({ quality: 84, effort: 6 })
  .toFile(OUT_PORTRAIT);

console.log(
  `${OUT_PORTRAIT}  ${W}x${H}  ${kb(OUT_PORTRAIT)}  (the scene is the bottom ${Math.round((PH / H) * 100)}%)`,
);
