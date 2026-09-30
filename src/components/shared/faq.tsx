export interface FaqItem {
  question: string;
  answer: string;
}

/** Native disclosure list - no JavaScript needed, keyboard accessible. */
export function Faq({
  items,
  title = 'Frequently asked questions',
  // A page could not hold two of these until the page builder existed. Two
  // elements sharing an id is invalid, and `aria-labelledby` then points at
  // whichever came first, so the second accordion is announced with the
  // first one's heading.
  id = 'faq-heading',
}: {
  items: FaqItem[];
  title?: string;
  id?: string;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-2xl font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {/*
        Not a <dl>.

        It was one, with each <dt> inside a <summary> inside a <details> - and
        a <dt> has to be a child of the <dl> or of a <div> that is. Nested
        inside a disclosure it is none of those, so the list was announced as
        a broken description list on every page carrying an FAQ.

        <details> and <summary> already say everything the list markup was
        trying to: a screen reader announces a disclosure, reads the question
        as its label, and reads the answer when it opens. The list added
        nothing except the invalidity.
      */}
      <div
        data-reveal-items=""
        className="mt-6 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]"
      >
        {items.map((item) => (
          <details key={item.question} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-medium text-ink hover:bg-surface">
              {item.question}
              <span
                aria-hidden="true"
                className="text-muted transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="px-5 pb-4 text-[14px] leading-relaxed text-muted">{item.answer}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
