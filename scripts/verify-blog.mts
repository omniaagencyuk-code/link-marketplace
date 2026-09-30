/**
 * The blog's editable sections, and the article format underneath them.
 *
 * No database and no browser. What is checked here is the part that decides
 * whether a post that has been saved comes back as the post that was written:
 * the merge onto the defaults, what a FAQ has to have before it becomes
 * structured data, and which heading levels survive a save.
 */
import { cleanRichTextDoc, richTextToPlainText, type RichTextDoc } from '../src/lib/cms/rich-text';
import {
  RELATED_MODES,
  blogSectionDefaults,
  readBlogSections,
} from '../src/lib/config/blog-sections';

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

/** A document of one heading at the given level. */
const heading = (level: number): unknown => ({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level }, content: [{ type: 'text', text: `Level ${level}` }] },
  ],
});

const levelOf = (doc: RichTextDoc) => Number(doc.content[0]?.attrs?.level);

console.log('\n--- an article may be six levels deep ---');
{
  // The blog toolbar offers H2 to H6. If the whitelist that runs on save does
  // not accept the same range, an H5 an editor chose is stored as an H2 and
  // the page renders a structure nobody wrote - silently, because clamping
  // produces a valid document either way.
  for (const level of [2, 3, 4, 5, 6]) {
    is(`h${level} survives a save`, levelOf(cleanRichTextDoc(heading(level))), level);
  }

  // The page owns its H1. A second one is a real fault rather than a taste.
  is('h1 is pulled back to h2', levelOf(cleanRichTextDoc(heading(1))), 2);
  is('and so is a level that does not exist', levelOf(cleanRichTextDoc(heading(9))), 2);
  is('and so is nonsense', levelOf(cleanRichTextDoc(heading(Number.NaN))), 2);
}

console.log('\n--- a post nobody has edited renders what it always did ---');
{
  const fresh = readBlogSections(undefined);
  is('the closing heading is the one the page hard-coded', fresh.cta.heading, 'Put it into practice');
  is('with the button it hard-coded', fresh.cta.primaryLabel, 'Create Free Account');
  is('pointing where it pointed', fresh.cta.primaryHref, '/signup');
  is('related posts, as before', fresh.relatedMode, 'related');
  is('and no questions invented for it', fresh.faqs.length, 0);

  // Junk in the column is a post, not a crash. This is jsonb: what comes back
  // is whatever was last written there, including by something that is not
  // this application.
  is('a string is not a section set', readBlogSections('nope').cta.heading, blogSectionDefaults.cta.heading);
  is('nor is an array', readBlogSections([1, 2]).relatedMode, 'related');
  is('nor is null', readBlogSections(null).marketplace.show, true);
}

console.log('\n--- a half-filled section still renders a whole page ---');
{
  // Shallow-merged per section rather than replaced wholesale: a post saved
  // before a field existed must not come back as a heading with nothing under
  // it, and a later field added in code has to reach posts already stored.
  const partial = readBlogSections({ cta: { heading: 'Ready to start?' } });
  is('the edited field is kept', partial.cta.heading, 'Ready to start?');
  is('the rest comes from the defaults', partial.cta.body, blogSectionDefaults.cta.body);
  is('including the button', partial.cta.primaryLabel, 'Create Free Account');

  // A field of the wrong type is ignored rather than trusted through.
  const wrong = readBlogSections({ cta: { heading: 42, show: 'yes' } });
  is('a number is not a heading', wrong.cta.heading, blogSectionDefaults.cta.heading);
  is('and a string is not a checkbox', wrong.cta.show, true);
}

console.log('\n--- a question with no answer is not a FAQ ---');
{
  /*
    Both halves become a `FAQPage` entry, and Google treats a question with an
    empty answer as a reason to distrust the markup on the whole page rather
    than as one row to skip. Half-typed questions are exactly what an editor
    leaves behind on the way to publishing.
  */
  const faqs = readBlogSections({
    faqs: [
      { question: 'Does it work?', answer: 'Yes.' },
      { question: 'Half typed', answer: '   ' },
      { question: '', answer: 'An answer to nothing.' },
      { question: '  Padded  ', answer: '  Also padded.  ' },
      'not an object',
      null,
    ],
  }).faqs;

  is('only the complete ones are kept', faqs.length, 2);
  is('the first is intact', faqs[0]?.question, 'Does it work?');
  is('and the padded one is trimmed', faqs[1]?.question, 'Padded');
  is('on both halves', faqs[1]?.answer, 'Also padded.');
  yes('nothing empty survives', faqs.every((faq) => faq.question && faq.answer));
}

console.log('\n--- what follows the article ---');
{
  for (const mode of RELATED_MODES) {
    is(`"${mode.label}" is a real choice`, readBlogSections({ relatedMode: mode.value }).relatedMode, mode.value);
  }
  is('an unknown mode falls back', readBlogSections({ relatedMode: 'sideways' }).relatedMode, 'related');
  yes('every mode is explained to whoever picks it', RELATED_MODES.every((mode) => mode.help.length > 10));
}

console.log('\n--- the article as plain text ---');
{
  // Used for the meta description and the reading time when the post was
  // written in the editor, where `body` is empty and reading it gives nothing.
  const doc = cleanRichTextDoc({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'A heading' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'And a sentence under it.' }] },
    ],
  });

  is('words do not run together across blocks', richTextToPlainText(doc), 'A heading And a sentence under it.');
  yes('a long document is cut to the limit', richTextToPlainText(doc, 12).length <= 15);
  is('an empty document is an empty string', richTextToPlainText({ type: 'doc', content: [] }), '');
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
