'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A highlighter passing under a phrase, or a line drawing itself beneath one.
 *
 * The same shape as `Reveal` and for the same reasons, with one difference
 * that matters: this never hides anything. The phrase is text in the HTML
 * either way - what animates is the decoration behind it - so the worst case
 * when JavaScript does not run is a highlight that is simply already drawn,
 * which is what the CSS does by default.
 *
 * Arming is therefore the opposite way round to a reveal. `Reveal` hides on
 * arming; this un-draws on arming, and only once it knows the phrase is below
 * the fold. A highlight already on screen when the page loads is left alone,
 * because drawing it would mean removing it first in front of somebody
 * looking straight at it.
 *
 * Reduced motion is honoured here by never arming, and again in CSS, so a
 * phrase rendered without this component still behaves.
 */
export function Ink({
  variant = 'highlight',
  children,
}: {
  variant?: 'highlight' | 'underline';
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // On screen already: leave it drawn. See above.
    const box = element.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return;

    element.dataset.lbArmed = 'true';

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.lbOn = 'true';
          // One pass of the highlighter. Nothing here animates twice.
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -15% 0px', threshold: 0.01 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={ref} data-lb-ink={variant}>
      {children}
    </span>
  );
}

/**
 * Something that drifts, slowly, forever.
 *
 * No JavaScript: a CSS animation on `transform` alone, which the compositor
 * runs without waking the main thread, and which `prefers-reduced-motion`
 * turns off in the stylesheet. `seconds` is the whole cycle - six or seven is
 * slow enough to read as floating rather than as something going wrong.
 */
export function Float({
  seconds = 6,
  delayMs = 0,
  className,
  children,
}: {
  seconds?: number;
  delayMs?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-lb-float=""
      className={className}
      style={{ '--lb-float': `${seconds}s`, '--lb-delay': `${delayMs}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
