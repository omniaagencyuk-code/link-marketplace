/**
 * What an editor may change about how a section looks.
 *
 * The line this file draws is the whole point of it. An editor picks from a
 * list; the design system decides what the list means. There is no hex field,
 * no colour picker, no opacity slider and no class name - a section stores
 * `background: 'soft-blue'`, and what soft blue *is* lives in `globals.css`
 * beside every other token.
 *
 * ## Why the colours are here as well as in CSS
 *
 * Because contrast is arithmetic, and arithmetic needs numbers. Every pairing
 * this file offers has been measured: `verify:sections` computes the WCAG
 * ratio for each background and each text colour it allows over it, and fails
 * if one drops below the threshold. That is what stops an editor putting
 * yellow on cream - not a note in the help text, a test.
 *
 * The thresholds are the two WCAG asks for: 4.5:1 for body copy, 3:1 for the
 * large text a heading accent always is.
 *
 * ## What is deliberately absent
 *
 * Fonts, sizes, margins, radii, shadows, columns, breakpoints. A section can
 * say what colour it is and what is drawn behind it. It cannot say how big
 * anything is, because there is nowhere here to put that.
 */

export const BACKGROUNDS = [
  'default',
  'white',
  'soft-grey',
  'soft-blue',
  'soft-green',
  'soft-cream',
  'soft-red',
  'soft-purple',
  'navy',
  'brand-blue',
  'brand-green',
] as const;

export const TEXT_TONES = ['auto', 'navy', 'dark', 'white', 'blue', 'green', 'yellow'] as const;
export const ACCENTS = ['none', 'green', 'blue', 'yellow', 'red'] as const;
export const DECORATIONS = ['none', 'feathers', 'leaves', 'gradient', 'pattern'] as const;
/*
  `default` first, and it means the arrangement the component was designed
  with - the same idea as `default` on the background.

  Without it there is no way to say "as drawn": every component would take
  whichever value happened to be first, and the content upsell, whose mascot
  has always sat on the left, quietly flipped the first time a style column
  existed. A control needs a way to be unset.
*/
export const ARTWORK_POSITIONS = ['default', 'right', 'left'] as const;
export const ARTWORK_SIZES = ['default', 'small', 'medium', 'large'] as const;

export type Background = (typeof BACKGROUNDS)[number];
export type TextTone = (typeof TEXT_TONES)[number];
export type Accent = (typeof ACCENTS)[number];
export type Decoration = (typeof DECORATIONS)[number];
export type ArtworkPosition = (typeof ARTWORK_POSITIONS)[number];
export type ArtworkSize = (typeof ARTWORK_SIZES)[number];

export interface SectionStyle {
  background: Background;
  text: TextTone;
  accent: Accent;
  decoration: Decoration;
  artworkPosition: ArtworkPosition;
  artworkSize: ArtworkSize;
}

/** Nothing chosen: the section renders exactly as its component draws it. */
export const NO_STYLE: SectionStyle = {
  background: 'default',
  text: 'auto',
  accent: 'none',
  decoration: 'none',
  artworkPosition: 'default',
  artworkSize: 'default',
};

/**
 * A background, as the admin shows it and as the page renders it.
 *
 * `token` is the CSS custom property the wrapper reads, so the colour has one
 * definition and this file only points at it. `hex` is the same colour as a
 * number, for the contrast arithmetic and for the swatch in the admin - and
 * `verify:sections` checks the two agree, because a swatch that lies about
 * the colour is worse than no swatch.
 */
export interface BackgroundDef {
  key: Background;
  label: string;
  /** The CSS variable holding it. Absent for 'default'. */
  token?: string;
  hex: string;
  /** Which way the text goes over it, when the editor leaves it automatic. */
  tone: 'dark' | 'light';
  /** True for the strong colours, which only suit a band of short copy. */
  strong?: boolean;
}

export const BACKGROUND_DEFS: BackgroundDef[] = [
  // The component's own. Always first, always the default.
  { key: 'default', label: "The section's own", hex: '#ffffff', tone: 'dark' },

  { key: 'white', label: 'White', token: '--color-surface-raised', hex: '#ffffff', tone: 'dark' },
  { key: 'soft-grey', label: 'Soft grey', token: '--color-surface', hex: '#f7f9fb', tone: 'dark' },
  { key: 'soft-blue', label: 'Soft blue', token: '--color-sky-50', hex: '#e0f2fe', tone: 'dark' },
  { key: 'soft-green', label: 'Soft green', token: '--color-accent-50', hex: '#ecfdf5', tone: 'dark' },
  { key: 'soft-cream', label: 'Soft cream', token: '--color-sun-50', hex: '#fef3c7', tone: 'dark' },
  { key: 'soft-red', label: 'Soft red', token: '--color-coral-50', hex: '#fff4f0', tone: 'dark' },
  { key: 'soft-purple', label: 'Soft purple', token: '--color-violet-50', hex: '#f3e8ff', tone: 'dark' },

  { key: 'navy', label: 'Navy', token: '--color-navy-900', hex: '#0b1b2b', tone: 'light', strong: true },
  { key: 'brand-blue', label: 'Press Parrot blue', token: '--color-sky-500', hex: '#2563eb', tone: 'light', strong: true },
  /*
    Dark text, and that is a measurement rather than a preference. White on
    this green is 3.77:1 and fails body copy; the ink is 4.62:1 and passes.
    It was going to be white until the numbers were run.
  */
  { key: 'brand-green', label: 'Press Parrot green', token: '--color-accent-600', hex: '#059669', tone: 'dark', strong: true },
];

export interface TextToneDef {
  key: TextTone;
  label: string;
  /** Absent for 'auto', which takes the background's own tone. */
  token?: string;
  hex?: string;
}

export const TEXT_TONE_DEFS: TextToneDef[] = [
  { key: 'auto', label: 'Automatic' },
  { key: 'navy', label: 'Navy', token: '--color-ink', hex: '#0b1b2b' },
  { key: 'dark', label: 'Dark', token: '--color-ink-soft', hex: '#3d4f61' },
  { key: 'white', label: 'White', token: '--color-surface-raised', hex: '#ffffff' },
  { key: 'blue', label: 'Press Parrot blue', token: '--color-sky-500', hex: '#2563eb' },
  { key: 'green', label: 'Press Parrot green', token: '--color-accent-700', hex: '#047857' },
  { key: 'yellow', label: 'Parrot yellow', token: '--color-sun-400', hex: '#fbbf24' },
];

export interface AccentDef {
  key: Accent;
  label: string;
  token?: string;
  hex?: string;
}

export const ACCENT_DEFS: AccentDef[] = [
  { key: 'none', label: 'None' },
  { key: 'green', label: 'Green', token: '--color-accent-600', hex: '#059669' },
  { key: 'blue', label: 'Blue', token: '--color-sky-500', hex: '#2563eb' },
  { key: 'yellow', label: 'Yellow', token: '--color-sun-400', hex: '#fbbf24' },
  /*
    The darker beak rather than the brighter one. #f4633a is the brand's red
    and reads at 2.66:1 over soft purple - under the 3:1 a heading needs.
    #dd4a20 is the same colour one step down and clears it everywhere.
  */
  { key: 'red', label: 'Red', token: '--color-coral-600', hex: '#dd4a20' },
];

export const DECORATION_DEFS: { key: Decoration; label: string; help?: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'feathers', label: 'Subtle feathers', help: 'A few feathers in the top corner.' },
  { key: 'leaves', label: 'Subtle leaves', help: 'Monstera, as on the hero.' },
  { key: 'gradient', label: 'Soft gradient', help: 'A wash from one corner.' },
  { key: 'pattern', label: 'Parrot pattern', help: 'A repeating feather, very faint.' },
];

/** The WCAG minimums. Body copy is 4.5:1; a heading is large text at 3:1. */
export const CONTRAST_BODY = 4.5;
export const CONTRAST_LARGE = 3;

// --------------------------------------------------------------- contrast --

function channel(hex: string, at: number): number {
  const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance, per WCAG 2.1. */
export function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

export function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((lighter as number) + 0.05) / ((darker as number) + 0.05);
}

export function backgroundDef(key: Background): BackgroundDef {
  return BACKGROUND_DEFS.find((entry) => entry.key === key) ?? (BACKGROUND_DEFS[0] as BackgroundDef);
}

/**
 * The text colours that may be chosen over a background.
 *
 * Automatic is always offered, and so is anything that clears 4.5:1 against
 * it. Everything else is not disabled with a warning - it is not in the list,
 * because a control that can be set to something unreadable will be.
 */
export function textTonesFor(background: Background): TextToneDef[] {
  const bg = backgroundDef(background);
  return TEXT_TONE_DEFS.filter(
    (tone) => !tone.hex || contrast(bg.hex, tone.hex) >= CONTRAST_BODY,
  );
}

/** The heading accents that may be chosen over a background, at 3:1. */
export function accentsFor(background: Background): AccentDef[] {
  const bg = backgroundDef(background);
  return ACCENT_DEFS.filter((accent) => !accent.hex || contrast(bg.hex, accent.hex) >= CONTRAST_LARGE);
}

/**
 * A chosen text colour, or nothing if it is not allowed over this background.
 *
 * The same check the editor's list is built from, applied again at render.
 * A section saved before a palette change, or a value posted straight at the
 * server action, falls back to automatic rather than to unreadable.
 */
export function safeTextTone(style: SectionStyle): TextTone {
  if (style.text === 'auto') return 'auto';
  return textTonesFor(style.background).some((tone) => tone.key === style.text)
    ? style.text
    : 'auto';
}

export function safeAccent(style: SectionStyle): Accent {
  if (style.accent === 'none') return 'none';
  return accentsFor(style.background).some((accent) => accent.key === style.accent)
    ? style.accent
    : 'none';
}

// ---------------------------------------------------------------- presets --

/**
 * A preset is two choices at once, and nothing more.
 *
 * It is not stored. An editor picks "Soft blue" and the background and text
 * fields take those values; the section holds those values and no memory of
 * where they came from. A stored preset plus stored fields is two sources of
 * truth for one appearance, and they drift the first time somebody changes
 * one of them.
 */
export interface StylePreset {
  key: string;
  label: string;
  background: Background;
  text: TextTone;
}

export const PRESETS: StylePreset[] = [
  { key: 'clean', label: 'Clean', background: 'white', text: 'auto' },
  { key: 'grey', label: 'Soft grey', background: 'soft-grey', text: 'auto' },
  { key: 'blue', label: 'Soft blue', background: 'soft-blue', text: 'auto' },
  { key: 'green', label: 'Soft green', background: 'soft-green', text: 'auto' },
  { key: 'cream', label: 'Soft cream', background: 'soft-cream', text: 'auto' },
  { key: 'dark', label: 'Dark', background: 'navy', text: 'auto' },
  { key: 'brand-blue', label: 'Brand blue', background: 'brand-blue', text: 'auto' },
  { key: 'brand-green', label: 'Brand green', background: 'brand-green', text: 'auto' },
];

/** Which preset a section currently matches, if any. */
export function matchingPreset(style: SectionStyle): string {
  const found = PRESETS.find(
    (preset) => preset.background === style.background && preset.text === style.text,
  );
  return found?.key ?? '';
}

// ------------------------------------------------------------ the render --

/**
 * What the wrapper needs, worked out once.
 *
 * `attrs` go on the element around the section, and the CSS in `globals.css`
 * does the rest: the background rule beats the component's own utility on
 * specificity, and the tone rule redefines `--color-ink`, `--color-muted` and
 * `--color-line` for the subtree so every component follows without knowing
 * it is being restyled. Nothing here reaches into a component.
 */
export interface ResolvedStyle extends SectionStyle {
  /** True when anything at all was chosen - a plain section skips the wrapper. */
  styled: boolean;
  attrs: Record<string, string>;
  vars: Record<string, string>;
}

export function resolveStyle(style: SectionStyle): ResolvedStyle {
  const background = style.background;
  const bg = backgroundDef(background);
  const text = safeTextTone(style);
  const accent = safeAccent(style);

  const attrs: Record<string, string> = {};
  const vars: Record<string, string> = {};

  if (background !== 'default' && bg.token) {
    attrs['data-section-bg'] = background;
    vars['--section-bg'] = `var(${bg.token})`;
  }

  // Automatic follows the background. A chosen colour that survived the
  // contrast check wins, and carries the tone its own brightness implies so
  // the muted and border tokens move with it.
  const chosen = TEXT_TONE_DEFS.find((tone) => tone.key === text);
  const tone = text === 'auto' ? bg.tone : luminance(chosen?.hex ?? '#000000') > 0.4 ? 'light' : 'dark';

  if (background !== 'default' || text !== 'auto') {
    attrs['data-section-tone'] = tone;
  }
  if (chosen?.token) vars['--section-ink'] = `var(${chosen.token})`;

  if (accent !== 'none') {
    const def = ACCENT_DEFS.find((entry) => entry.key === accent);
    if (def?.token) vars['--section-accent'] = `var(${def.token})`;
  }

  if (style.decoration !== 'none') attrs['data-section-deco'] = style.decoration;

  return {
    ...style,
    text,
    accent,
    styled: Object.keys(attrs).length > 0,
    attrs,
    vars,
  };
}

// ----------------------------------------------------------- reading back --

function pick<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
}

/** A style read back from the database, which is to say from jsonb. */
export function readStyle(raw: unknown): SectionStyle {
  const stored = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};

  return {
    background: pick(stored.background, BACKGROUNDS, NO_STYLE.background),
    text: pick(stored.text, TEXT_TONES, NO_STYLE.text),
    accent: pick(stored.accent, ACCENTS, NO_STYLE.accent),
    decoration: pick(stored.decoration, DECORATIONS, NO_STYLE.decoration),
    artworkPosition: pick(stored.artworkPosition, ARTWORK_POSITIONS, NO_STYLE.artworkPosition),
    artworkSize: pick(stored.artworkSize, ARTWORK_SIZES, NO_STYLE.artworkSize),
  };
}
