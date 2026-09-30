'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { Animation } from '@/lib/cms/sections';

/**
 * A section arriving as you scroll to it.
 *
 * The whole thing is one IntersectionObserver and two CSS custom properties.
 * No animation library: everything it does is a transition on `opacity` and
 * `transform`, which the compositor handles without touching layout, and a
 * library would be more bytes on every page than the feature is worth.
 *
 * ## Nothing is hidden until it is safe to hide it
 *
 * The obvious build - `opacity: 0` in CSS, JavaScript reveals it - has two
 * failures, and both matter here.
 *
 * The first is that content disappears when JavaScript does not run. A
 * marketing page whose copy is invisible to a crawler, or to anyone whose
 * bundle failed, is worse in every way than a page that does not animate. So
 * the hidden state lives behind `data-armed`, which only JavaScript ever sets:
 * no script, no attribute, no hiding.
 *
 * The second is Largest Contentful Paint. An element at `opacity: 0` has not
 * been painted as far as the browser is concerned, so animating the thing at
 * the top of the page delays the metric that measures the top of the page.
 * This never arms an element that is already on screen - it marks it revealed
 * and stops. Above the fold, that means no animation and no cost; below it,
 * the element is off-screen when it is armed, so nobody can see it happen.
 *
 * Reduced motion is honoured twice: here, by never arming at all, and in CSS,
 * so that a page rendered without this component still behaves.
 */
export function Reveal({
  animation,
  children,
  as: Tag = 'div',
}: {
  animation: Animation;
  children: ReactNode;
  /** `div` wraps; pass `'section'` where the section does not bring its own. */
  as?: 'div' | 'section';
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Asked for stillness, or asked for nothing.
    if (
      animation.entrance === 'none' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    // Already on screen: reveal without hiding first. This is the branch that
    // protects the hero - there is no frame in which the element is invisible,
    // so there is nothing for LCP to wait for and nothing to flash.
    const box = element.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) {
      element.dataset.revealed = 'true';
      return;
    }

    element.dataset.armed = 'true';

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.revealed = 'true';
          // One entrance each. Nothing here animates twice, and an observer
          // that keeps firing on a long page is work for no reason.
          observer.unobserve(entry.target);
        }
      },
      // A little before the edge, so the movement finishes about when the
      // section is properly in view rather than starting there.
      { rootMargin: '0px 0px -10% 0px', threshold: 0.01 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [animation.entrance]);

  if (animation.entrance === 'none') return <>{children}</>;

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLElement>}
      data-reveal={animation.entrance}
      data-speed={animation.speed}
      data-delay={animation.delay}
    >
      {children}
    </Tag>
  );
}
