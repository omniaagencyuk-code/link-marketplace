'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * A wide table with a scrollbar at the top as well as the bottom.
 *
 * A table of nine hundred rows and fifteen columns has its right-hand columns
 * off the edge and its only scrollbar a thousand pixels below the header, so
 * reading what is cut off means scrolling to the bottom of the page, dragging
 * sideways, and scrolling back up. The bar above solves that without moving
 * anything else.
 *
 * It is a single empty div as wide as the table, in its own scroller. The two
 * scrollers are kept in step by copying `scrollLeft` between them, with a
 * flag so that copying does not itself count as a scroll and bounce back.
 *
 * The width is watched rather than measured once: the table grows when a
 * column's content does, and a bar that was the right width at first paint is
 * the wrong width the moment anything renders.
 *
 * The body scrolls vertically too, with a cap on its height, and that is what
 * makes the sticky header work rather than a decoration on it. `overflow-x:
 * auto` alone makes this element the scroll root - a sticky header inside it
 * then sticks to a box that is exactly as tall as its content and therefore
 * never scrolls, so the header leaves the screen with everything else. Giving
 * the box a height of its own is what it sticks to.
 */
export function TableScroll({
  children,
  className,
  /** How tall the table may get before it scrolls inside itself. */
  maxHeight = '70vh',
}: {
  children: ReactNode;
  className?: string;
  maxHeight?: string;
}) {
  const top = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const echoing = useRef(false);
  const [width, setWidth] = useState(0);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const scroller = body.current;
    if (!scroller) return;

    const measure = () => {
      setWidth(scroller.scrollWidth);
      // No bar where there is nothing to scroll. An eight-pixel strip that
      // does nothing is worse than no strip.
      setOverflows(scroller.scrollWidth > scroller.clientWidth + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    // The table itself, because a column can widen without the scroller's own
    // box changing at all.
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);

    return () => observer.disconnect();
  }, [children]);

  function sync(from: HTMLDivElement | null, to: HTMLDivElement | null) {
    if (!from || !to || echoing.current) return;
    echoing.current = true;
    to.scrollLeft = from.scrollLeft;
    // Released on the next frame rather than immediately: the assignment
    // above fires a scroll event, and clearing the flag first would let it
    // echo straight back.
    requestAnimationFrame(() => {
      echoing.current = false;
    });
  }

  return (
    <div className={cn('rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]', className)}>
      {overflows ? (
        <div
          ref={top}
          onScroll={() => sync(top.current, body.current)}
          // Kept out of the tab order and hidden from screen readers: it is a
          // second handle on the same content, not content of its own.
          aria-hidden="true"
          className="overflow-x-auto overflow-y-hidden border-b border-line"
        >
          <div style={{ width, height: 1 }} />
        </div>
      ) : null}

      <div
        ref={body}
        onScroll={() => sync(body.current, top.current)}
        style={{ maxHeight }}
        className="overflow-auto"
      >
        {children}
      </div>
    </div>
  );
}
