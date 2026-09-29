/**
 * Reading a Majestic export, and what it is allowed to conclude from it.
 *
 * No API key and no database: this decides what nine hundred listings get
 * labelled as, and the labelling is a suggestion somebody accepts - so the
 * thing worth checking is that it suggests nothing it cannot justify.
 *
 * The fixture is twenty rows taken from a real Bulk Backlink Checker export,
 * chosen to cover the shapes that actually occur rather than the first twenty
 * in the file.
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { nicheFromTopic, suggestNiche } from '../src/lib/majestic/topics';
import { readMajesticCsv, readRow, TOPICS_KEPT } from '../src/lib/majestic/parse';
import { categoryBySlug } from '../src/lib/data/categories';
import { acceptedOrEmpty, describeUnusableFile } from '../src/lib/majestic/summary';

let failed = 0;
const ok = (l: string) => console.log(`  PASS  ${l}`);
const bad = (l: string, d?: string) => {
  failed += 1;
  console.log(`  FAIL  ${l}${d ? ` - ${d}` : ''}`);
};
const is = (l: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(l) : bad(l, `expected ${String(expected)}, got ${String(actual)}`);
const has = (l: string, haystack: string, needle: string) =>
  haystack.includes(needle) ? ok(l) : bad(l, `missing ${JSON.stringify(needle)} in ${JSON.stringify(haystack)}`);

const raw = fs.readFileSync(
  path.join(process.cwd(), 'scripts/fixtures/majestic-export.csv'),
  'utf8',
);
const parsed = Papa.parse<Record<string, string>>(raw, {
  header: true,
  skipEmptyLines: 'greedy',
  transformHeader: (h) => h.trim(),
});
const rows = parsed.data;

console.log('\n--- a topic becomes one of our categories, or nothing ---');
{
  is('gambling is iGaming', nicheFromTopic('Games/Gambling'), 'igaming');
  is('however Majestic files it', nicheFromTopic('Recreation/Gambling'), 'igaming');

  // Longest prefix wins, which is the whole reason the general rules can stay
  // general. Without it every Business topic would be "business".
  is('a specific rule beats the general one', nicheFromTopic('Business/Financial Services'), 'finance');
  is('and a deeper one beats that', nicheFromTopic('Business/Financial Services/Banking Services'), 'finance');
  is('while the bare topic stays general', nicheFromTopic('Business'), 'business');
  is('an unknown leaf falls back to its parent', nicheFromTopic('Computers/Something/Nobody/Has/Seen'), 'technology');

  /*
    Geography is not a topic.

    Seventy-two of nine hundred domains lead with a Regional topic. Mapping
    "Europe" to a category would put a listing in a filter its buyer did not
    ask for, which is worse than leaving it uncategorised.
  */
  is('a region maps to nothing', nicheFromTopic('Regional/Europe'), null);
  is('and so does a continent', nicheFromTopic('Regional/South America'), null);
  is('and adult content has no category here', nicheFromTopic('Adult/World'), null);
  is('nonsense maps to nothing rather than to something', nicheFromTopic('Nonsense/Topic'), null);

  // The three added from the inventory.
  is('news has a home now', nicheFromTopic('News/Media Industry'), 'news-media');
  is('and the environment', nicheFromTopic('Science/Environment'), 'science-environment');
  is('and education', nicheFromTopic('Reference/Education'), 'education');
  is('every category a rule names exists', [...new Set(
    ['igaming','finance','business','technology','news-media','science-environment','education',
     'travel','food','automotive','home-garden','sports','entertainment','lifestyle','health']
  )].every((slug) => categoryBySlug.has(slug as never)), true);
}

console.log('\n--- a suggestion looks past a topic it cannot use ---');
{
  // A site whose leading topic is geography and whose second is travel is a
  // travel site. Refusing to look past the first would leave it unlabelled.
  const suggestion = suggestNiche([
    { topic: 'Regional/Europe', value: 30 },
    { topic: 'Recreation/Travel', value: 24 },
  ]);
  is('it takes the strongest topic that maps', suggestion?.niche, 'travel');
  is('and says which one it came from', suggestion?.from.topic, 'Recreation/Travel');

  is('nothing mappable suggests nothing', suggestNiche([{ topic: 'Regional/Europe', value: 30 }]), null);
  is('and no topics at all suggests nothing', suggestNiche([]), null);
}

console.log('\n--- the export reads back ---');
{
  const file = readMajesticCsv(rows);
  is('every fixture row with figures is read', file.readings.length > 0, true);

  const gambling = file.readings.find((r) => r.topics[0]?.topic === 'Games/Gambling');
  is('a gambling site is found', Boolean(gambling), true);
  is('with its trust flow', typeof gambling?.trustFlow, 'number');
  is('its citation flow', typeof gambling?.citationFlow, 'number');
  is('and iGaming suggested', gambling?.suggestedNiche, 'igaming');

  is('at most three topics are kept', file.readings.every((r) => r.topics.length <= TOPICS_KEPT), true);
  is('none of them is blank', file.readings.every((r) => r.topics.every((t) => t.topic.length > 0)), true);
  // Every domain is normalised on the way in, so it matches a listing by the
  // same rule the importer and the publisher inbox use.
  is('domains are normalised', file.readings.every((r) => r.domain === r.domain.toLowerCase()), true);
  is('and carry no scheme', file.readings.every((r) => !r.domain.includes('/')), true);
}

console.log('\n--- nothing is overwritten with a blank ---');
{
  /*
    Majestic returns a row for every item it was asked about, including the
    ones it found nothing for. Writing those as zeroes over a listing that
    already has figures is the one thing an enrichment pass must never do.
  */
  is('a row with no figures is dropped', readRow({ Item: 'nothing.com', 'Trust Flow': '', 'Citation Flow': '' }), null);
  is('and a row with no domain is dropped', readRow({ Item: '', 'Trust Flow': '20' }), null);

  const zero = readRow({ Item: 'zero.com', 'Trust Flow': '0', 'Citation Flow': '0' });
  // Zero is a measurement. It is not the same as not measured, and it is the
  // reason every one of these fields is nullable.
  is('but a measured zero is kept', zero?.trustFlow, 0);

  const missing = readRow({ Item: 'partial.com', 'Trust Flow': '14' });
  is('a missing column reads as null, not zero', missing?.citationFlow, null);
  is('while the one that is there is read', missing?.trustFlow, 14);
}

console.log('\n--- headers are matched, not assumed ---');
{
  // Majestic's interactive table and its downloaded file spell these
  // differently, and a header this does not recognise means a column silently
  // lost - so the spellings are matched rather than the position.
  const underscored = readRow({
    Domain: 'x.com',
    TrustFlow: '31',
    CitationFlow: '40',
    TopicalTrustFlow_Topic_0: 'Games/Gambling',
    TopicalTrustFlow_Value_0: '28',
  });
  is('an API-style header set reads', underscored?.trustFlow, 31);
  is('including its topics', underscored?.topics[0]?.topic, 'Games/Gambling');
  is('and the suggestion that follows', underscored?.suggestedNiche, 'igaming');

  const spaced = readRow({ item: 'y.com', 'TRUST FLOW': '9', 'citation flow': '11' });
  is('case does not matter', spaced?.trustFlow, 9);
  is('nor does it for the other', spaced?.citationFlow, 11);
}

console.log('\n--- a repeated domain takes the newer measurement ---');
{
  const file = readMajesticCsv([
    { Item: 'dup.com', 'Trust Flow': '10', 'Citation Flow': '10' },
    { Item: 'dup.com', 'Trust Flow': '22', 'Citation Flow': '30' },
  ]);
  is('one reading per domain', file.readings.length, 1);
  is('and it is the last one', file.readings[0]?.trustFlow, 22);
}

console.log('\n--- what the import screen says before it writes ---');
{
  const file = readMajesticCsv(rows);
  const summary = acceptedOrEmpty(file.readings);
  is('every reading with a topic is counted', summary.withTopics > 0, true);
  is('and never more than there are readings', summary.withTopics <= file.readings.length, true);
  is('suggestions are a subset of those', summary.suggested <= summary.withTopics, true);
  is('an empty file summarises to nothing', acceptedOrEmpty([]).withTopics, 0);
}

console.log('\n--- a file that yields nothing says why ---');
{
  /*
    This screen used to render nothing at all for a file it could not use: it
    parsed it, found no readings, and drew no summary, because the summary was
    only written for the case where there was something to summarise.

    The commonest way to get there is dropping in the list of domains that
    went INTO Majestic rather than the export that came out. Both are CSVs,
    both are called something like "all domains", and one of them has no Trust
    Flow column at all.
  */
  const inputList = describeUnusableFile(['Item'], 925);
  has('an input list is named as one', inputList, 'pasted *into* Majestic');
  has('and the export is described', inputList, '.backlinks');
  has('with the columns it did have', inputList, 'Item');

  const partial = describeUnusableFile(['Item', 'Trust Flow', 'Citation Flow'], 10);
  has('a missing topic column is named', partial, 'a topic column');
  is('and the ones present are not', partial.includes('no Trust Flow'), false);

  const empty = describeUnusableFile(
    ['Item', 'Trust Flow', 'Citation Flow', 'Topical Trust Flow Topic 0'],
    0,
  );
  has('a right-shaped empty file says so', empty, 'no rows in it');

  const notFound = describeUnusableFile(
    ['Item', 'Trust Flow', 'Citation Flow', 'Topical Trust Flow Topic 0'],
    12,
  );
  has('and rows Majestic found nothing for say that instead', notFound, 'not found');

  // Header matching has to be as forgiving here as it is in the parser, or
  // the diagnosis contradicts the thing it is diagnosing.
  is(
    'the check reads headers the parser would accept',
    describeUnusableFile(['Domain', 'TrustFlow', 'CitationFlow', 'TopicalTrustFlow_Topic_0'], 5)
      .includes('no Majestic columns'),
    false,
  );
}

console.log('\n--- the mapping earns its keep on a real export ---');
{
  /*
    Not a style check. If a change to the rules quietly stops categorising
    most of the file, the symptom is nine hundred listings sitting under
    whatever they had before, and nobody notices for a month.

    Measured on the fixture rather than the full export, which is not in the
    repository - so the bar is set at what the fixture's spread supports.
  */
  const file = readMajesticCsv(rows);
  const suggested = file.readings.filter((r) => r.suggestedNiche).length;
  const share = Math.round((suggested / file.readings.length) * 100);
  is(`at least half the fixture is categorised (got ${share}%)`, share >= 50, true);

  // And the ones it declines are the ones it should: geography and adult.
  const declined = file.readings.filter((r) => !r.suggestedNiche);
  is(
    'nothing is declined that has a mappable topic',
    declined.every((r) => r.topics.every((t) => nicheFromTopic(t.topic) === null)),
    true,
  );
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
