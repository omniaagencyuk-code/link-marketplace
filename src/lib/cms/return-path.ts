/**
 * Where to put somebody back after they leave preview.
 *
 * The path arrives from a form field, so it is a value a stranger can set and
 * is treated as one: a site-relative path and nothing else. `//evil.test` is
 * a protocol-relative URL that browsers follow off-site, and a backslash is
 * read as a slash by enough of them to be worth refusing rather than
 * reasoning about.
 *
 * Here rather than in the action file beside it because everything exported
 * from a `'use server'` module becomes a callable endpoint, and a pure string
 * check has no business being one.
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}
