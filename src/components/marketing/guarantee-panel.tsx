import {
  CHECK_EVERY_DAYS,
  GUARANTEE_MONTHS,
  PUBLISHER_GRACE_DAYS,
} from '@/lib/monitoring/guarantee';
import { HARD_FAILURES_TO_LOSE } from '@/lib/monitoring/status';

/**
 * The link guarantee, as the code enforces it.
 *
 * Every figure here is the constant the checker and the claim service run on,
 * imported rather than written out, because this panel sits on a page a
 * customer could hold us to. The editable body of the refund policy explains
 * what the guarantee is for; this says what it measures, and it cannot drift
 * from the job that does the measuring.
 *
 * It is deliberately a definition list rather than prose. Somebody reading
 * this has had a link come down and wants one number.
 */

/**
 * Small numbers as words, the way the rest of the document writes them.
 *
 * Under ten spelled out, ten and over in digits - the ordinary rule for prose
 * - because the figures are imported and "2 failed checks in a row" in the
 * middle of a legal page reads like a template nobody finished. The numbers
 * still come from the constants; only their spelling is decided here.
 */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function spell(count: number): string {
  return WORDS[count] ?? String(count);
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function days(count: number): string {
  return `${spell(count)} ${count === 1 ? 'day' : 'days'}`;
}

const ROWS: { term: string; detail: string }[] = [
  {
    term: 'How long it runs',
    detail: `${spell(GUARANTEE_MONTHS)} months from the day the link is published.`,
  },
  {
    term: 'How often we look',
    detail: `Every ${days(CHECK_EVERY_DAYS)} for as long as the guarantee runs.`,
  },
  {
    term: 'What counts as gone',
    detail: `${cap(spell(HARD_FAILURES_TO_LOSE))} failed checks in a row. One is a blip, and a page we cannot read at all is never counted as a link that was taken down.`,
  },
  {
    term: "The publisher's chance to put it back",
    detail: `${days(PUBLISHER_GRACE_DAYS)} from the day we tell them, and we tell them the same day we tell you.`,
  },
  {
    term: 'Then it is your choice',
    detail:
      'A replacement placement at no charge, or a refund of what you paid for that placement. Nobody chooses for you.',
  },
];

export function GuaranteePanel() {
  return (
    <aside className="mt-8 rounded-xl border border-line bg-surface p-6" aria-label="The link guarantee">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">The link guarantee</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        These are the figures the checker itself runs on, not a summary of them.
      </p>

      <dl className="mt-5 space-y-4">
        {ROWS.map((row) => (
          <div key={row.term} className="sm:grid sm:grid-cols-[13rem_1fr] sm:gap-5">
            <dt className="text-[13px] font-medium text-ink">{row.term}</dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-ink-soft sm:mt-0">{row.detail}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
