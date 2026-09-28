/**
 * Prove the Gmail reader turns real message shapes into readable text.
 *
 * No key, no network, no database. These are the parts that decide what the
 * model sees, and if they are wrong the symptom is a draft that quietly says
 * nothing - which costs money to discover and is hard to spot afterwards.
 *
 * The fixtures are the four shapes that actually break parsers: a nested
 * multipart tree, an HTML-only reply, a body in a legacy charset with an
 * encoded-word subject, and a forwarded message.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  addressOf,
  decodeBase64Url,
  decodeEncodedWords,
  htmlToText,
  looksLikeRateCard,
  parseMessage,
  type GmailMessage,
} from '../src/lib/gmail/mime';
import { gmailSearchUrl, gmailThreadUrl, readThread, type GmailThread } from '../src/lib/gmail/thread';
import { isOurs, outreachAddresses } from '../src/lib/sourcing/outreach';
import { planQueue } from '../src/lib/gmail/queueing';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);
const has = (label: string, haystack: string, needle: string) =>
  haystack.includes(needle) ? ok(label) : bad(label, `missing ${JSON.stringify(needle)}`);
const hasNot = (label: string, haystack: string, needle: string) =>
  !haystack.includes(needle) ? ok(label) : bad(label, `should not contain ${JSON.stringify(needle)}`);

const dir = path.join(process.cwd(), 'scripts/fixtures/gmail');
const load = <T,>(name: string): T => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as T;

console.log('\n--- base64url ---');
is('padding is not required', decodeBase64Url('aGVsbG8').toString('utf8'), 'hello');
is('whitespace does not break it', decodeBase64Url('aGVs\nbG8=').toString('utf8'), 'hello');
is('the url-safe alphabet decodes', decodeBase64Url('-_8').length, 2);
is('an empty body is empty, not an error', decodeBase64Url('').length, 0);

console.log('\n--- a nested multipart tree ---');
{
  const parsed = parseMessage(load<GmailMessage>('nested-multipart.json'));
  has('the plain part is found under two levels', parsed.text, '550 EUR per guest post');
  hasNot('and the html twin is not appended to it', parsed.text, '<b>');
  is('the attachment is recorded', parsed.attachments.length, 1);
  is('with its filename', parsed.attachments[0]?.filename, 'ratecard-2026.pdf');
  is('and its size, without its contents', parsed.attachments[0]?.size, 182000);
  is('a pdf is treated as a possible rate card', looksLikeRateCard(parsed.attachments[0]!), true);
  is('the sender is parsed out of the display name', addressOf(parsed.headers.from), 'mette@holdsport.example');
}

console.log('\n--- an html-only reply ---');
{
  const parsed = parseMessage(load<GmailMessage>('html-only.json'));
  has('a price in a table cell survives', parsed.text, '250');
  has('and so does the second row', parsed.text, '120');
  has('a numeric entity becomes its character', parsed.text, '£');
  has('the link text is kept', parsed.text, 'our blog');
  has('with its href, which is where the example placement is', parsed.text, 'https://revue.example/post');
  hasNot('script contents never reach the model', parsed.text, 'track()');
  hasNot('nor does the stylesheet', parsed.text, 'color:red');
  hasNot('and no tags survive', parsed.text, '<');
}

console.log('\n--- a body that is not utf-8 ---');
{
  const parsed = parseMessage(load<GmailMessage>('windows-1252.json'));
  has('windows-1252 currency decodes', parsed.text, '550€');
  has('and so do accented characters', parsed.text, 'Café');
  is('an encoded-word subject is readable', parsed.headers.subject, 'Tarifs pour votre société');
  has('an encoded-word sender is too', parsed.headers.from ?? '', 'Benoît');
  is('the address still parses out of it', addressOf(parsed.headers.from), 'jb@moingt.example');
}

console.log('\n--- a forwarded message ---');
{
  const parsed = parseMessage(load<GmailMessage>('forwarded.json'));
  has('the covering note is read', parsed.text, 'Forwarding their reply');
  has('and the forwarded body underneath it', parsed.text, 'We charge 400 EUR');
}

console.log('\n--- html to text, on its own ---');
is('an empty document is empty', htmlToText(''), '');
has('a break becomes a newline', htmlToText('a<br>b'), '\n');
is('an unknown entity is left alone', htmlToText('&weird;'), '&weird;');
is('a decoded word with no encoding is untouched', decodeEncodedWords('plain subject'), 'plain subject');

console.log('\n--- our own addresses ---');
is('all six outreach addresses are known', outreachAddresses().length, 6);
is('the newest one is among them', isOurs('info@inovamarketing.co.uk'), true);
is('one of them is ours', isOurs('INFO@omniaagency.uk'), true);
is('case and spacing do not matter', isOurs('  contact@omnia-marketing.co.uk '), true);
is('a publisher is not', isOurs('mette@holdsport.example'), false);
is('but the mailbox being read always is', isOurs('shared@omnia.example', ['shared@omnia.example']), true);

// The case this exists for: a thread carrying a message from another of our
// mailboxes, one that is not on the static list. Read as a publisher, our own
// words would become their terms - so the allowlist is passed in as ours.
//
// The address below is deliberately NOT in outreach.ts. Using one that is
// would make this pass whether or not the allowlist is plumbed through, which
// is a test that proves nothing.
{
  const raw = JSON.parse(
    fs.readFileSync(path.join(dir, 'thread-with-reply.json'), 'utf8'),
  ) as GmailThread;
  for (const header of raw.messages?.[0]?.payload?.headers ?? []) {
    if (header.name === 'From') header.value = 'Shared <shared@omnia.example>';
  }

  const known = readThread(raw, 'contact@omniaagency.uk', ['shared@omnia.example']);
  const unknown = readThread(raw, 'contact@omniaagency.uk', []);

  if ('skip' in known || 'skip' in unknown) {
    bad('both readings keep the thread');
  } else {
    has('an allowlisted address is labelled as us', known.thread.bodyText, '--- Us (shared@omnia.example)');
    has(
      'and without the allowlist it would read as a publisher',
      unknown.thread.bodyText,
      '--- Publisher (shared@omnia.example)',
    );
  }
}

console.log('\n--- a whole thread ---');
{
  const read = readThread(load<GmailThread>('thread-with-reply.json'), 'jack@omniamedia.uk');
  if ('skip' in read) {
    bad('a thread with a reply is kept', read.skip);
  } else {
    const thread = read.thread;
    has('our question is in the transcript', thread.bodyText, 'do you accept sponsored posts');
    has('and their answer', thread.bodyText, '550 EUR per post');
    has('each message says who wrote it', thread.bodyText, '--- Publisher (hello@nomadbento.example)');
    hasNot('quoted history is stripped from the reply', thread.bodyText, '> Hi, do you accept');
    has('but the unstripped copy keeps it', thread.bodyRaw, '> Hi, do you accept');
    is('the row is keyed on their latest reply', thread.messageId, 'in-1@nomadbento.example');
    is('every message id is recorded for dedupe', thread.messageIds.length, 2);
    is('the sender is the publisher, not us', thread.fromAddress, 'hello@nomadbento.example');
    is('the domain comes from our subject', thread.askedAboutDomain, 'nomadbento.example');
    is('a csv is flagged as a possible rate card', thread.hasRateCard, true);
    is('and recorded by name only', thread.attachments[0]?.filename, 'rates.csv');
  }
}

console.log('\n--- a thread nobody answered ---');
{
  const read = readThread(load<GmailThread>('thread-no-reply.json'), 'info@omniaagency.uk');
  is('our own outreach alone is skipped', 'skip' in read ? read.skip : 'kept', 'no-reply');
}

console.log('\n--- what a run decides to fetch ---');
{
  const seen = [
    { id: 'row-old', gmail_thread_id: 't-unchanged', history_id: '100', status: 'fetched' },
    { id: 'row-moved', gmail_thread_id: 't-moved', history_id: '100', status: 'fetched' },
    { id: 'row-queued', gmail_thread_id: 't-queued', history_id: '100', status: 'pending' },
    { id: 'row-skipped', gmail_thread_id: 't-skipped', history_id: '100', status: 'skipped' },
    { id: 'row-nohistory', gmail_thread_id: 't-nohistory', history_id: null, status: 'fetched' },
  ];
  const refs = [
    { id: 't-new', historyId: '500' },
    { id: 't-unchanged', historyId: '100' },
    { id: 't-moved', historyId: '250' },
    { id: 't-queued', historyId: '250' },
    { id: 't-skipped', historyId: '250' },
    { id: 't-nohistory', historyId: '250' },
  ];

  const plan = planQueue(refs, seen);
  is('a thread we have never seen is fetched', plan.insert.map((r) => r.id).join(), 't-new');
  is('a thread that has not moved is left alone', plan.requeue.includes('row-old'), false);
  is('a thread with new replies is fetched again', plan.requeue.includes('row-moved'), true);
  is('one already queued is not queued twice', plan.requeue.includes('row-queued'), false);
  // Skipped means "our outreach only" - if it has moved, somebody replied.
  is('a skipped thread that has moved is reconsidered', plan.requeue.includes('row-skipped'), true);
  // The expensive mistake: re-reading the whole backlog every single run.
  is(
    'a thread with no recorded history is not re-fetched on suspicion',
    plan.requeue.includes('row-nohistory'),
    false,
  );
  is('nothing is both inserted and requeued', plan.insert.length + plan.requeue.length, 3);
}

{
  const nothing = planQueue([], []);
  is('an empty search queues nothing', nothing.insert.length + nothing.requeue.length, 0);
}

console.log('\n--- finding an email by its Message-ID ---');
{
  // Uploaded emails have no thread id, and those are the rows on the rate
  // card list that point at an attachment nobody can reach.
  const url = gmailSearchUrl('<CAF=abc+123@mail.gmail.com>');
  has('the brackets the mbox reader keeps are stripped', url ?? '', 'rfc822msgid%3ACAF');
  hasNot('and no bracket survives into the url', url ?? '', '%3C');
  has('it is a search, not a thread', url ?? '', '#search/');

  const withMailbox = gmailSearchUrl('abc@example.com', 'info@omniaagency.uk');
  has('a known mailbox picks the right account', withMailbox ?? '', 'authuser=info%40omniaagency.uk');

  // A link that always finds nothing is worse than no link.
  is('a pasted reply has no real message id', gmailSearchUrl('pasted:9f2c'), null);
  is('nor does a thread we could not read one from', gmailSearchUrl('gmail-thread:a:b'), null);
  is('and an empty id gives nothing', gmailSearchUrl(''), null);
}

console.log('\n--- the link back to Gmail ---');
{
  const url = gmailThreadUrl('info@omniaagency.uk', 't-thread-1');
  has('it names the mailbox', url, 'authuser=info%40omniaagency.uk');
  has('and the thread', url, '#all/t-thread-1');
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
