/**
 * A country's flag, from its code.
 *
 * Computed rather than looked up: a two-letter code maps to two regional
 * indicator symbols, which every current platform renders as a flag. A table
 * of two hundred emoji would be two hundred rows to keep in step with the
 * country list for no gain.
 *
 * Windows is the known exception - it draws the two letters instead of a flag,
 * which is legible and is why the country name always appears beside it rather
 * than the flag standing alone.
 */

/** 'A' is 0x41; the regional indicator block starts at 0x1F1E6. */
const OFFSET = 0x1f1e6 - 0x41;

export function flagEmoji(code: string): string {
  const upper = (code ?? '').trim().toUpperCase();
  // Anything that is not two plain letters would produce two stray symbols.
  if (!/^[A-Z]{2}$/.test(upper)) return '';

  return String.fromCodePoint(...[...upper].map((letter) => letter.charCodeAt(0) + OFFSET));
}
