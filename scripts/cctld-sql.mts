/**
 * The ccTLD table as SQL, generated from the TypeScript.
 *
 * The suffix list has to exist in the migration too - a backfill runs in the
 * database, not in the app - and a list kept in two places drifts, with the
 * stale copy being the one that decides a publisher's market. So the SQL is
 * printed from the module, and `verify:marketplace` asserts the migration
 * still matches it.
 *
 *   npx tsx scripts/cctld-sql.mts
 */
import { countryFromDomain } from '../src/lib/data/cctld';

/** Every two-letter suffix, so the trusted ones can be found by asking. */
const pairs: [string, string][] = [];
for (let a = 97; a <= 122; a += 1) {
  for (let b = 97; b <= 122; b += 1) {
    const suffix = String.fromCharCode(a) + String.fromCharCode(b);
    const country = countryFromDomain(`example.${suffix}`);
    if (country) pairs.push([suffix, country]);
  }
}

export const cctldPairs = pairs;

export function cctldValuesSql(indent = '  '): string {
  return pairs.map(([suffix, country]) => `${indent}('${suffix}', '${country}')`).join(',\n');
}

if (process.argv[1]?.endsWith('cctld-sql.mts')) {
  console.log(cctldValuesSql());
  console.error(`\n-- ${pairs.length} suffixes`);
}
