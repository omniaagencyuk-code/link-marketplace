export interface FaqItem {
  question: string;
  answer: string;
}

/** Native disclosure list - no JavaScript needed, keyboard accessible. */
export function Faq({ items, title = 'Frequently asked questions' }: { items: FaqItem[]; title?: string }) {
  return (
    <section aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight text-ink">
        {title}
      </h2>
      <dl className="mt-6 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]">
        {items.map((item) => (
          <div key={item.question}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-medium text-ink hover:bg-surface">
                <dt>{item.question}</dt>
                <span
                  aria-hidden="true"
                  className="text-muted transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <dd className="px-5 pb-4 text-[14px] leading-relaxed text-muted">{item.answer}</dd>
            </details>
          </div>
        ))}
      </dl>
    </section>
  );
}
