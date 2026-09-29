import fs from 'node:fs';
import Papa from 'papaparse';
import { readMajesticCsv } from '../src/lib/majestic/parse';
import { nicheFromTopic } from '../src/lib/majestic/topics';

const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(process.argv[2], 'utf8'), {
  header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim(),
});
const { readings } = readMajesticCsv(data);

let gains = 0;
let one = 0;
let two = 0;
const tally = new Map<string, number>();
for (const r of readings) {
  const mapped = r.topics.map((t) => ({ n: nicheFromTopic(t.topic), v: t.value }));
  const primary = mapped.find((m) => m.n)?.n ?? null;
  const extra = [...new Set(mapped.filter((m) => m.n && m.n !== primary && m.v >= 5).map((m) => m.n))];
  if (extra.length) { gains += 1; if (extra.length === 1) one += 1; else two += 1; }
  for (const slug of extra) tally.set(slug as string, (tally.get(slug as string) ?? 0) + 1);
}
console.log(`readings ${readings.length}`);
console.log(`would gain a secondary niche: ${gains} (${Math.round(gains / readings.length * 100)}%)  one: ${one}  two: ${two}`);
console.log('\nsecondary niches added:');
for (const [k, v] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
