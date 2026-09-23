/**
 * Prove the mbox reader does what the ingestion step depends on.
 *
 * No API key and no database: this is the half of the pipeline that decides
 * which messages ever reach the model, so it has to be checkable on its own.
 * If this is wrong, extraction is wrong and it costs money to find out.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readMbox, readPastedEmail, domainFromSubject, stripQuotedHistory } from '../src/lib/sourcing/mbox';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);

const raw = fs.readFileSync(path.join(process.cwd(), 'scripts/fixtures/sourcing-synthetic.mbox'), 'utf8');
const { messages, skipped } = readMbox(raw);

console.log('\n--- what was read ---');
is('every message is separated', messages.length + skipped.length, 12);
is('our own outreach is skipped', skipped.filter((s) => s.reason === 'ours').length, 1);
is('the bounce is skipped', skipped.filter((s) => s.reason === 'bounce').length, 1);
is('the rest are kept', messages.length, 10);

console.log('\n--- headers ---');
const network = messages.find((m) => m.fromAddress === 'mette@holdsport.example');
network ? ok('a sender address is parsed out of "Name <addr>"') : bad('sender parsed');
is('the display name comes through', network?.fromName, 'Mette Holm');
is('the date is an ISO timestamp', network?.sentAt?.slice(0, 10), '2026-09-22');

console.log('\n--- the domain we asked about ---');
is('recovered from the subject', network?.askedAboutDomain, 'holdsport.example');
is('a Re: prefix does not hide it', domainFromSubject('Re: Advertisements on foo.example'), 'foo.example');
is('a German AW: prefix does not either', domainFromSubject('AW: Advertisements on foo.example'), 'foo.example');
is('"your website" is not a domain', domainFromSubject('Re: Advertisements on your website'), undefined);
is('www is stripped', domainFromSubject('Advertisements on www.foo.example'), 'foo.example');
const noDomain = messages.find((m) => m.fromAddress === 'redaktion@klatschrunde.example');
is('so that email has none', noDomain?.askedAboutDomain, undefined);

console.log('\n--- encodings ---');
const base64 = messages.find((m) => m.fromAddress === 'priya@businessvantage.example');
/General topics — £100/.test(base64?.bodyText ?? '')
  ? ok('base64 bodies decode, em dash and pound intact') : bad('base64 decodes', base64?.bodyText?.slice(0, 60));
/Crypto, forex, loans — £150/.test(base64?.bodyText ?? '')
  ? ok('and the whole rate list survives') : bad('base64 rate list');
const qp = messages.find((m) => m.fromAddress === 'giulia.zanotti@webmail.example');
/perché la casella/.test(qp?.bodyText ?? '')
  ? ok('quoted-printable decodes accented text') : bad('quoted-printable', qp?.bodyText?.slice(0, 80));
const german = noDomain?.bodyText ?? '';
/Mit freundlichen Grüßen/.test(german) ? ok('German umlauts and eszett survive') : bad('German text', german.slice(0, 60));

console.log('\n--- html-only replies ---');
const html = messages.find((m) => m.fromAddress === 'camila@modabolha.example');
/R\$1\.130/.test(html?.bodyText ?? '') ? ok('an html rate table becomes readable text') : bad('html table', html?.bodyText?.slice(0, 120));
/R\$980/.test(html?.bodyText ?? '') ? ok('both payment rates are kept') : bad('second html rate');
!/<table>|<td>/.test(html?.bodyText ?? '') ? ok('no markup reaches the model') : bad('markup stripped');
/Olá Jack/.test(html?.bodyText ?? '') ? ok('html entities are decoded') : bad('entities decoded', html?.bodyText?.slice(0, 40));

console.log('\n--- quoted history ---');
const stripped = messages.filter((m) => /I'm getting in touch about advertising/.test(m.bodyText));
is('our outreach is gone from every reply', stripped.length, 0);
messages.every((m) => m.bodyText.trim().length > 0) ? ok('and no body was emptied by the strip') : bad('a body was emptied');
messages.some((m) => /I'm getting in touch about advertising/.test(m.bodyRaw))
  ? ok('the raw body still has it, for a re-read') : bad('raw body kept');

is(
  'an English "On ... wrote:" marker cuts',
  stripQuotedHistory('Yes, 150 EUR.\n\nOn Mon, 22 Sep 2026 at 09:14, Jack <j@x.com> wrote:\n> our email'),
  'Yes, 150 EUR.',
);
is(
  'a German "Am ... schrieb ...:" marker cuts',
  stripQuotedHistory('Preis 150 EUR.\n\nAm 22.09.2026 um 09:14 schrieb Jack:\n> unsere Mail'),
  'Preis 150 EUR.',
);
is(
  'a body that is entirely quoted is kept whole',
  stripQuotedHistory('> only quoted lines here').length > 0,
  true,
);

console.log('\n--- pasting one email ---');
const pasted = readPastedEmail('Hi Jack,\n\nGuest post is 200 GBP.\n\nThanks', 'editor@site.example');
is('a bare body is accepted', pasted?.bodyText.includes('200 GBP'), true);
is('and given an address from the form', pasted?.fromAddress, 'editor@site.example');
const pastedTwice = readPastedEmail('Hi Jack,\n\nGuest post is 200 GBP.\n\nThanks', 'editor@site.example');
is('pasting the same text twice dedupes to one id', pasted?.messageId, pastedTwice?.messageId);
const withHeaders = readPastedEmail(
  'From: Ed <ed@site.example>\nSubject: Re: Advertisements on site.example\nMessage-ID: <abc@x>\n\nRate is 300 EUR.',
);
is('headers are used when pasted', withHeaders?.fromAddress, 'ed@site.example');
is('including the domain we asked about', withHeaders?.askedAboutDomain, 'site.example');

console.log('\n--- re-reading the same export ---');
const again = readMbox(raw);
is('produces the same message ids', again.messages.map((m) => m.messageId).join(), messages.map((m) => m.messageId).join());
const doubled = readMbox(`${raw}\n${raw}`);
is('and a doubled file still yields each message once', doubled.messages.length, messages.length);

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
