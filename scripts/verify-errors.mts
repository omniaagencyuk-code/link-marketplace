/**
 * What the application shows when a page fails.
 *
 * Until this week there was no error boundary anywhere in it, so one slow
 * query produced a bare platform failure: no explanation, no way back, and
 * nothing to quote. Four boundaries and a hand-styled last resort now cover
 * it. This checks the three things about them that would fail silently.
 *
 * No browser and no database: these are facts about the files.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);
const yes = (label: string, actual: boolean) =>
  actual ? ok(label) : bad(label, 'expected it to hold, and it did not');

/*
  Prose is not code.

  These checks look for a prop name, and the files explain themselves at
  length - `src/app/error.tsx` says "resetting a password" in a comment, and a
  future one may well write "reset" about the button it is not using. A check
  that reads the commentary is a check that fails for the wrong reason, and a
  check that fails for the wrong reason gets loosened until it stops failing
  for the right one.
*/
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(entry) ? [full] : [];
  });

const boundaries = walk('src/app')
  .filter((file) => /[\\/](error|global-error)\.tsx$/.test(file))
  .sort();

console.log('\n--- every area has a boundary, and the root has the catch-all ---');
{
  yes('there are boundaries at all', boundaries.length > 0);

  /*
    The root one is what makes the set complete.

    Signing in, signing up, resetting a password, the admin login and the
    unsubscribe page a prospect reaches from an email all sit outside the
    three area boundaries. Without a boundary at the root, a failure in any of
    them skips every one of them and lands on `global-error`, which replaces
    the root layout and therefore arrives with no stylesheet - a worse page
    for a problem that is no worse. With it, `global-error` means what it
    says: the root layout itself failed.
  */
  yes('the root catch-all exists', existsSync('src/app/error.tsx'));
  yes('and the last resort below it exists', existsSync('src/app/global-error.tsx'));

  for (const area of ['src/app/(marketing)', 'src/app/dashboard', 'src/app/admin/(protected)']) {
    yes(`${area} keeps its own shell when a page in it fails`, existsSync(join(area, 'error.tsx')));
  }
}

console.log('\n--- the prop is the one this version of Next passes ---');
{
  /*
    Read off the installed Next rather than remembered.

    `reset` was the name for three major versions and is the one that comes to
    mind; in this version `retry` is the one that re-fetches, and `reset`
    merely clears the boundary and re-renders the same children. Both are
    still passed, so using the wrong one does not throw - the button renders,
    somebody presses it, and a query that timed out redraws the identical
    failure. That is the shape of mistake this file is for.

    Pinned to the type declaration so a future upgrade that renames it fails
    here rather than in front of a customer.
  */
  const info = readFileSync('node_modules/next/dist/client/components/error-boundary.d.ts', 'utf8');
  yes('Next still passes retry', /retry:\s*\(\)\s*=>\s*void/.test(info));
  yes('and still passes reset too, so the wrong one is silent', /reset:\s*\(\)\s*=>\s*void/.test(info));

  /*
    The panel is in this list as well as the boundaries, because it is the one
    that actually calls the thing. A boundary can be handed `retry` correctly
    and the panel still press `reset`.
  */
  for (const file of [...boundaries, 'src/components/shared/error-panel.tsx']) {
    const src = code(readFileSync(file, 'utf8'));
    yes(`${file} takes retry`, /\bretry\b/.test(src));
    is(`${file} does not reach for reset`, /\breset\b/.test(src), false);

    // An error boundary has to be a client component; a server one is simply
    // never used, and nothing says so.
    yes(`${file} is a client component`, /^'use client';/m.test(src));
  }
}

console.log('\n--- the digest survives to the screen ---');
{
  /*
    In production Next withholds a server error's message from the browser on
    purpose, so a connection string cannot arrive in a page. `error.digest` is
    the hash it prints in the server log beside the real stack trace, and it
    is the only handle joining what somebody saw to what was logged. A
    boundary that drops it is a boundary that cannot be acted on - which is
    what we had during the marketplace outage.
  */
  const panel = code(readFileSync('src/components/shared/error-panel.tsx', 'utf8'));
  yes('the shared panel prints the digest', /error\.digest/.test(panel));

  for (const file of boundaries) {
    const src = code(readFileSync(file, 'utf8'));
    const reaches = /error\.digest/.test(src) || /ErrorPanel/.test(src);
    yes(`${file} reaches the digest`, reaches);
  }
}

console.log('\n--- the last resort is styled by hand, because nothing else reaches it ---');
{
  /*
    `global-error` renders its own document and does not include the
    application's stylesheet - the bundled documentation says so outright. A
    Tailwind class in here does nothing, and the page it would produce is
    unstyled black text on white: exactly the "the site is broken" impression
    the whole change exists to remove. The failure is invisible in review,
    because the class names read correctly.
  */
  const global = code(readFileSync('src/app/global-error.tsx', 'utf8'));
  is('no className in the last resort', /className=/.test(global), false);
  is('and it pulls in no stylesheet that would not arrive', /\.css'/.test(global), false);
  yes('it renders its own document', /<html/.test(global) && /<body/.test(global));
  yes('its title is an element, since metadata exports cannot be', /<title>/.test(global));
}

console.log('\n--- the way back goes somewhere that exists ---');
{
  /*
    A recovery link that 404s is worse than no recovery link: somebody who has
    already hit one failure hits a second, and concludes the site is down
    rather than that a page is. Counted against the routes on disk.
  */
  const routes = new Set(
    walk('src/app')
      .filter((file) => /[\\/]page\.tsx$/.test(file))
      .map(
        (file) =>
          file
            .replace(/^src[\\/]app/, '')
            .replace(/[\\/]page\.tsx$/, '')
            .replace(/[\\/]\([^)]+\)/g, '') || '/',
      ),
  );

  const hrefs = [...boundaries, 'src/components/shared/error-panel.tsx'].flatMap((file) =>
    [...code(readFileSync(file, 'utf8')).matchAll(/href(?:=|: )'(\/[^']*)'/g)].map((m) => ({
      file,
      href: m[1],
    })),
  );

  yes('a boundary offers a way back at all', hrefs.length > 0);
  const broken = hrefs.filter(({ href }) => !routes.has(href));
  is('every way back points at a page that exists', broken.map((b) => `${b.file} -> ${b.href}`).join(', '), '');
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
