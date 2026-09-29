/**
 * How much of a real export this can categorise, and what it cannot.
 *
 * Not a test - a measurement, run by hand against a file to decide whether
 * the mapping table needs another rule or the taxonomy needs another
 * category. Point it at any Bulk Backlink Checker export:
 *
 *   npx tsx scripts/majestic-coverage.mts path/to/export.csv
 */
import fs from 'node:fs';
import Papa from 'papaparse';
import { readMajesticCsv } from '../src/lib/majestic/parse';

const file = process.argv[2] ?? 'scripts/fixtures/majestic-export.csv';
const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(file, 'utf8'), {
  header: true,
  skipEmptyLines: 'greedy',
  transformHeader: (h) => h.trim(),
});

const { readings, unusable } = readMajesticCsv(data);
const suggested = readings.filter((r) => r.suggestedNiche);

console.log(`\n${file}`);
console.log(`  read ${readings.length}, ${unusable.length} with nothing usable`);
console.log(
  `  categorised ${suggested.length} (${Math.round((suggested.length / Math.max(1, readings.length)) * 100)}%)\n`,
);

const tally = (pairs: string[]) => {
  const counts = new Map<string, number>();
  for (const key of pairs) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
};

console.log('  would land in');
for (const [slug, n] of tally(suggested.map((r) => r.suggestedNiche as string))) {
  console.log(`    ${String(n).padStart(4)}  ${slug}`);
}

const left = readings.filter((r) => !r.suggestedNiche);
if (left.length > 0) {
  console.log('\n  left uncategorised, by leading topic');
  for (const [topic, n] of tally(left.map((r) => r.topics[0]?.topic ?? '(no topic)')).slice(0, 15)) {
    console.log(`    ${String(n).padStart(4)}  ${topic}`);
  }
  console.log(`    ${String(left.length).padStart(4)}  in total`);
}
console.log();
