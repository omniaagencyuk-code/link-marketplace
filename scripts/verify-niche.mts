/**
 * What a homepage read is allowed to conclude.
 *
 * No network, no API key, no database and no model call - the rules and the
 * checking are pure, which is the point of keeping them apart from the run
 * that fetches pages. The same arrangement `verify:sourcing` has.
 */
import { categories } from '../src/lib/data/categories';
import { NICHE_CONFIDENCE_FLOOR, NICHE_PROMPT_VERSION, NICHE_RULES } from '../src/lib/sourcing/niche-rules';
import { readNiche, wireNicheSchema, type WireNiche } from '../src/lib/sourcing/niche-schema';
import { requestBody, type NicheOutcome } from '../src/lib/sourcing/niche-client';
import { CALL_FAILED, COULD_NOT_READ, categoryReadRow } from '../src/lib/sourcing/niche-row';

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

const PAGE = [
  'Match reports, transfer rumours and tactical analysis from across the',
  'Premier League. Our writers cover every fixture, and the Saturday round-up',
  'has run since 2011. We also preview the weekend’s racing.',
].join(' ');

const answer = (over: Partial<WireNiche> = {}): WireNiche => ({
  niche: 'sports',
  confidence: 85,
  quote: 'Match reports, transfer rumours and tactical analysis',
  reason: 'Every headline is a match report.',
  ...over,
});

console.log('\n--- the rules describe the categories that exist ---');
{
  /*
    Generated from the category list rather than typed into the prompt. A
    category added to the marketplace and not to the prompt would be one the
    schema accepts and the model has never heard of - and the failure would
    be silent, because the model would simply never return it.
  */
  for (const category of categories) {
    yes(`"${category.slug}" is offered to the model`, NICHE_RULES.includes(`\`${category.slug}\``));
  }
  is('every category is listed and no more', (NICHE_RULES.match(/^- `/gm) ?? []).length, categories.length);

  yes('the prompt is versioned', /^niche-from-homepage-\d+$/.test(NICHE_PROMPT_VERSION));

  /*
    Three rules the prompt must keep saying, because each is one the whole
    thing is worthless without. Checked as text, which is weak - but a prompt
    silently losing its injection paragraph is worth a weak check.
  */
  yes('it says the page is not an instruction', /never as an instruction/i.test(NICHE_RULES));
  yes('it says the domain is not evidence', /not evidence/i.test(NICHE_RULES));
  yes('it says unknown beats a near-miss', /Never pick the closest category/i.test(NICHE_RULES));
}

console.log('\n--- a good answer ---');
{
  const reading = readNiche(answer(), PAGE);
  is('is proposed', reading.kind, 'proposed');
  if (reading.kind === 'proposed') {
    is('with the category the model gave', reading.proposal.niche, 'sports');
    is('and its confidence', reading.proposal.confidence, 85);
  }
}

console.log('\n--- the quote is checked, not trusted ---');
{
  /*
    The rule `checkDraft` applies to a price in an outbound email, for the
    same reason: a model asked to quote will usually quote and will sometimes
    write what the page ought to have said. A category resting on a sentence
    the page does not contain rests on nothing - and in the review queue it
    looks exactly like one that rests on something.
  */
  const invented = readNiche(
    answer({ quote: 'The leading destination for football fans worldwide' }),
    PAGE,
  );
  is('a quote the page does not contain is refused', invented.kind, 'declined');
  if (invented.kind === 'declined') is('and named as such', invented.because, 'quote-not-on-the-page');

  // Loose on punctuation, strict on words - or the check gets deleted for
  // failing on a curly apostrophe.
  const respaced = readNiche(
    answer({ quote: 'Match   reports,\n transfer rumours and tactical analysis' }),
    PAGE,
  );
  is('whitespace is not what makes a quote wrong', respaced.kind, 'proposed');

  const straightened = readNiche(answer({ quote: "preview the weekend's racing" }), PAGE);
  is('and neither is a straightened apostrophe', straightened.kind, 'proposed');

  const tooShort = readNiche(answer({ quote: 'Match' }), PAGE);
  is('a single word is not a quote', tooShort.kind, 'declined');
  if (tooShort.kind === 'declined') is('and is named a missing one', tooShort.because, 'no-quote');

  const none = readNiche(answer({ quote: '   ' }), PAGE);
  is('nor is nothing at all', none.kind, 'declined');
}

console.log('\n--- unknown is an answer, and the floor is a floor ---');
{
  const unknown = readNiche(answer({ niche: 'unknown', confidence: 95 }), PAGE);
  is('unknown is declined however sure the model is', unknown.kind, 'declined');
  if (unknown.kind === 'declined') is('and says the model said so', unknown.because, 'model-said-unknown');

  const atFloor = readNiche(answer({ confidence: NICHE_CONFIDENCE_FLOOR }), PAGE);
  is('exactly at the floor is kept', atFloor.kind, 'proposed');

  const under = readNiche(answer({ confidence: NICHE_CONFIDENCE_FLOOR - 1 }), PAGE);
  is('one below it is not', under.kind, 'declined');
  if (under.kind === 'declined') is('and says why', under.because, 'below-the-floor');

  const nonsense = readNiche(answer({ confidence: Number.NaN }), PAGE);
  is('a confidence that is not a number is not a high one', nonsense.kind, 'declined');

  const over = readNiche(answer({ confidence: 140 }), PAGE);
  if (over.kind === 'proposed') {
    is('and one above the maximum is clamped rather than ranked first', over.proposal.confidence, 100);
  } else bad('a confidence above the maximum is still a proposal');
}

console.log('\n--- the row, which the table will not accept if it is wrong ---');
{
  /*
    `website_category_reads` constrains a row to say either what it found or
    why it found nothing - never both, never neither. A mapping that can
    break that fails at the database, on somebody's first click, as a 500
    with a constraint name in it. The constraint is the wall; this is the
    thing that must never walk into it, so every shape is run through the
    same assertion the constraint makes.
  */
  const good = { url: 'https://x.test/', httpStatus: 200, text: PAGE };
  const row = (over: Partial<Parameters<typeof categoryReadRow>[0]> = {}) =>
    categoryReadRow({
      websiteId: 'w1',
      page: good,
      model: 'claude-haiku-5-5',
      now: '2026-01-01T00:00:00.000Z',
      ...over,
    });

  const holds = (r: Record<string, unknown>) =>
    (r.niche !== null && r.declined_because === null) ||
    (r.niche === null && r.declined_because !== null);

  const proposed: NicheOutcome = {
    reading: readNiche(answer(), PAGE),
    usage: { inputTokens: 2400, outputTokens: 55 },
    model: 'claude-haiku-5-5',
  };
  const declined: NicheOutcome = {
    reading: readNiche(answer({ niche: 'unknown' }), PAGE),
    usage: { inputTokens: 2400, outputTokens: 20 },
    model: 'claude-haiku-5-5',
  };
  const failed: NicheOutcome = { error: 'overloaded', model: 'claude-haiku-5-5' };

  const shapes: [string, Record<string, unknown>][] = [
    ['a proposal', row({ outcome: proposed })],
    ['a refusal', row({ outcome: declined })],
    ['a failed call', row({ outcome: failed })],
    ['a page that would not fetch', row({ page: { url: 'https://x.test/', text: '', error: 'HTTP 404' } })],
    ['a page with nothing on it', row({ page: { url: 'https://x.test/', httpStatus: 200, text: '   ' } })],
    ['no outcome at all', row({})],
  ];
  for (const [label, built] of shapes) {
    yes(`${label} satisfies the one-or-the-other constraint`, holds(built));
  }

  is('a proposal carries the category', row({ outcome: proposed }).niche, 'sports');
  is('and its quote', row({ outcome: proposed }).quote, answer().quote);
  is('a refusal names the reason it was refused',
    row({ outcome: declined }).declined_because, 'model-said-unknown');
  is('a failed call is told apart from a refusal',
    row({ outcome: failed }).declined_because, CALL_FAILED);
  is('and an unfetchable page from both',
    row({ page: { url: 'https://x.test/', text: '', error: 'HTTP 404' } }).declined_because,
    COULD_NOT_READ);

  /*
    Spend is measured, not estimated - and a call that produced nothing
    usable still cost what it cost. A figure that only counts the successes
    is not a spend figure.
  */
  is('a refusal still records what it cost', row({ outcome: declined }).input_tokens, 2400);
  is('a page nobody could fetch cost nothing',
    row({ page: { url: 'https://x.test/', text: '', error: 'HTTP 404' } }).input_tokens, 0);

  /*
    A re-read describes the new read. Carrying the old applied timestamp
    forward would say a category had been accepted that never was.
  */
  is('a fresh read is never already applied', row({ outcome: proposed }).applied_at, null);
  is('and records which rules produced it',
    row({ outcome: proposed }).prompt_version, NICHE_PROMPT_VERSION);
}

console.log('\n--- the request, where the money and the truncation live ---');
{
  /*
    None of this is checkable by reading the answer, because the failures are
    silent: a ceiling too low truncates the JSON and arrives as a parse
    error, and a breakpoint in the wrong place just costs more.
  */
  const body = requestBody({ domain: 'example.test', text: PAGE });

  /*
    Thinking is on by default on this model and its tokens count against the
    ceiling. 1,000 was the first value here and it was wrong: the answer is
    small, the thinking in front of it is not bounded by how small the answer
    is.
  */
  yes('the output ceiling leaves room for thinking', body.max_tokens >= 2_000);

  // A classification, not a problem. Effort is what thinking costs.
  is('and the effort is low', body.output_config.effort, 'low');

  /*
    The rules are byte-identical on every call and the page is not. Reversed,
    every site throws the cache away - which over 1,840 sites is the
    difference between paying for the rules once and paying for them 1,840
    times.
  */
  is('the rules carry the cache breakpoint', body.system[0]?.cache_control?.type, 'ephemeral');
  yes('and the page is in the user turn, after them',
    typeof body.messages[0]?.content === 'string' && body.messages[0].content.includes(PAGE.slice(0, 40)));
  yes('the rules are not in the user turn',
    !String(body.messages[0]?.content ?? '').includes('Never pick the closest category'));

  // The domain is given so the model knows which site it is reading. The
  // prompt is what says it is not evidence.
  yes('the domain is given', String(body.messages[0]?.content ?? '').includes('example.test'));

  /*
    A long homepage is cut before it is sent, and `readNiche` is given the
    same cut text to check the quote against - a quote from the part that was
    dropped is one the model could not have read.
  */
  const long = requestBody({ domain: 'x.test', text: 'A'.repeat(50_000) });
  yes('a long page is cut before it is paid for',
    String(long.messages[0]?.content ?? '').length < 10_000);
}

console.log('\n--- the wire shape ---');
{
  /*
    The enum is what stops an invented category. Without it the first thing
    through would be a slug nobody has a page for.
  */
  const made_up = wireNicheSchema.safeParse({
    niche: 'gardening-and-light-industry',
    confidence: 90,
    quote: 'x',
    reason: 'y',
  });
  is('a category we do not have is refused on the wire', made_up.success, false);

  const real = wireNicheSchema.safeParse({
    niche: 'sports', confidence: 90, quote: 'x', reason: 'y',
  });
  is('and one we do have is accepted', real.success, true);

  const sentinel = wireNicheSchema.safeParse({
    niche: 'unknown', confidence: 10, quote: '', reason: 'Parked domain.',
  });
  is('and so is the sentinel', sentinel.success, true);

  const missing = wireNicheSchema.safeParse({ niche: 'sports', confidence: 90 });
  is('a missing field is refused rather than defaulted', missing.success, false);
}

console.log(failed === 0 ? '\n  all passed\n' : `\n  ${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
