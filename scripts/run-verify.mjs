/**
 * Run the verification suites, all of them, and say which failed.
 *
 * `npm run verify:all` locally, and the two CI jobs. The point is the list:
 * it is read out of package.json rather than written down anywhere, so a
 * suite somebody adds is a suite that runs. A hand-kept list in a workflow
 * file is the same arrangement as a rule kept in both code and a document -
 * it drifts, and the copy that drifted is the one nobody is reading.
 *
 * Every suite runs even after one fails. A CI run that stops at the first
 * red tells you one thing per push; this tells you everything that is
 * broken, which is the difference between one cycle and four.
 *
 *   node scripts/run-verify.mjs            every suite
 *   node scripts/run-verify.mjs pure       the ones needing nothing
 *   node scripts/run-verify.mjs database   the ones needing a local Postgres
 *   node scripts/run-verify.mjs --list     print the names and stop
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * The suites that need a local PostgreSQL, and so cannot run on a machine
 * that has not started one. Everything else needs no key, no network and no
 * database, which is a property those suites are written to keep.
 *
 * `verify:schema` wants its own cluster on another port - it replays the
 * migrations into a second database to check the row mappers against the
 * real column list.
 */
const DATABASE_SUITES = new Set(['verify:schema', 'verify:rls', 'verify:search']);

const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/*
  Every verify script except the ones that are this runner.

  Spotted by what they invoke rather than by name: `verify:all`,
  `verify:pure` and `verify:database` are themselves `verify:` scripts, and
  the first version of this filter excluded only the first of them - so
  `npm run verify:pure` ran itself, twice, forever. A list of names to skip
  would have needed updating the next time one was added; what they run
  cannot go stale.
*/
const all = Object.entries(scripts)
  .filter(([name, command]) => name.startsWith('verify:') && !command.includes('run-verify'))
  .map(([name]) => name)
  .sort();

const group = process.argv.find((arg) => arg === 'pure' || arg === 'database') ?? 'all';
const chosen = all.filter((name) => {
  if (group === 'pure') return !DATABASE_SUITES.has(name);
  if (group === 'database') return DATABASE_SUITES.has(name);
  return true;
});

if (process.argv.includes('--list')) {
  console.log(chosen.join('\n'));
  process.exit(0);
}

/*
  A group that matched nothing is a failure, not an empty success.

  A typo in the group name, or a rename that empties `DATABASE_SUITES`,
  would otherwise be a CI job that passes in four seconds having run
  nothing - which is the shape of green that costs the most.
*/
if (chosen.length === 0) {
  console.error(`No suites matched "${group}". package.json has: ${all.join(', ') || 'none'}`);
  process.exit(1);
}

console.log(`Running ${chosen.length} ${group === 'all' ? '' : `${group} `}suites\n`);

const failures = [];
for (const name of chosen) {
  const started = Date.now();
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`);
  const result = spawnSync('npm', ['run', '--silent', name], {
    stdio: 'inherit',
    // `npm` is a shell script on Windows runners; this repo's CI is Linux.
    shell: false,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  // A suite killed by a signal has no exit code. Treat that as a failure
  // rather than as a pass, which `status === 0` alone would not.
  const ok = result.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${seconds}s`);
  if (!ok) failures.push({ name, status: result.status, signal: result.signal });
}

console.log(`\n${'='.repeat(64)}`);
console.log(`${chosen.length - failures.length} of ${chosen.length} suites passed`);

if (failures.length > 0) {
  for (const failure of failures) {
    console.log(`  FAILED  ${failure.name}${failure.signal ? ` (killed by ${failure.signal})` : ''}`);
  }
  process.exit(1);
}
