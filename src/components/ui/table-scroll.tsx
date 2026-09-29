'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  MIN_TABLE_HEIGHT,
  TABLE_HEIGHT_STEP,
  clampTableHeight,
  fitTableHeight,
} from '@/lib/admin/table-height';

/**
 * A wide table with a scrollbar at the top as well as the bottom, and a
 * bottom edge that can be dragged to make it taller.
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
 *
 * That cap is the reason for the grip. A height that suits a laptop wastes
 * two thirds of a large screen, and how many rows someone wants at once
 * depends on what they are doing - comparing margins across the inventory
 * wants as many as the screen will hold, reading one listing closely does
 * not. So the edge is draggable, double-clicking it fills the screen, and
 * where it was put is remembered per table: the choice is about the monitor
 * and the job, neither of which changes between visits.
 */
export function TableScroll({
  children,
  className,
  /** How tall the table is before anyone drags it. */
  maxHeight = '70vh',
  /**
   * Where this table's height is remembered. Tables differ in how many rows
   * are worth seeing at once, so they are remembered apart. Omit and the
   * height resets on every visit.
   */
  storageKey,
  /** What the grip is resizing, for the label a screen reader reads. */
  label = 'table',
}: {
  children: ReactNode;
  className?: string;
  maxHeight?: string;
  storageKey?: string;
  label?: string;
}) {
  const top = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const echoing = useRef(false);
  const [width, setWidth] = useState(0);
  const [overflows, setOverflows] = useState(false);
  // null until dragged: the default is a viewport fraction, which is not a
  // pixel count until the browser has one.
  const [height, setHeight] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

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

  // Read after mount rather than during render: there is no localStorage on
  // the server, and a height that differs between the two is a hydration
  // mismatch.
  useEffect(() => {
    if (!storageKey) return;

    let saved: number | null = null;
    try {
      const stored = Number(window.localStorage.getItem(storageKey));
      if (Number.isFinite(stored) && stored >= MIN_TABLE_HEIGHT) saved = stored;
    } catch {
      // Private browsing, or storage turned off. The default height is fine.
    }
    if (saved == null) return;

    // Applied on the next frame rather than in the effect itself. Setting
    // state here would render the whole table a second time before the first
    // paint, and a remembered height is a restore, not something that has to
    // beat the first frame.
    const restore = saved;
    const frame = requestAnimationFrame(() => setHeight(clamp(restore)));
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);

  const remember = useCallback(
    (next: number) => {
      setHeight(next);
      if (!storageKey) return;
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        // As above - a height that is not remembered still works today.
      }
    },
    [storageKey],
  );

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

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    const scroller = body.current;
    if (!scroller) return;
    const from = scroller.getBoundingClientRect().height;
    const at = event.clientY;

    // Captured so the drag survives the pointer leaving the grip, which it
    // does immediately - the grip moves with the edge, the pointer does not.
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);

    const move = (moved: PointerEvent) => setHeight(clamp(from + moved.clientY - at));
    const end = (ended: PointerEvent) => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      remember(clamp(from + ended.clientY - at));
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  /** As tall as the screen allows, which is what the grip is usually aimed at. */
  function fitToScreen() {
    const scroller = body.current;
    if (!scroller) return;

    // Fitting from where the table currently is only works while its top is
    // on screen. Dragged tall and scrolled down, the top is above the
    // viewport, and filling from there makes a box whose header is off the
    // top - losing the sticky header, which is the whole point of the extra
    // height. So bring the top back into view and fit from there.
    const top = scroller.getBoundingClientRect().top;
    if (top < 0) window.scrollBy({ top, behavior: 'instant' });

    remember(fitTableHeight(scroller.getBoundingClientRect().top, window.innerHeight));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const scroller = body.current;
    if (!scroller) return;
    const from = scroller.getBoundingClientRect().height;

    if (event.key === 'ArrowDown') remember(clamp(from + TABLE_HEIGHT_STEP));
    else if (event.key === 'ArrowUp') remember(clamp(from - TABLE_HEIGHT_STEP));
    else if (event.key === 'End') fitToScreen();
    else if (event.key === 'Home') remember(MIN_TABLE_HEIGHT);
    else return;

    event.preventDefault();
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
        // A dragged height is exact; the default is a cap the table may not
        // reach, so a short table stays short.
        style={height == null ? { maxHeight } : { height }}
        className="overflow-auto"
      >
        {children}
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Drag to resize the ${label}, or double-click to fit the screen`}
        tabIndex={0}
        onPointerDown={startDrag}
        onDoubleClick={fitToScreen}
        onKeyDown={onKeyDown}
        // No text selection while dragging: a drag that begins on a grip and
        // ends over the table otherwise highlights every row it crossed.
        className={cn(
          'group flex h-4 cursor-ns-resize touch-none items-center justify-center rounded-b-[var(--radius-card)] border-t border-line transition-colors select-none',
          'hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:outline-none',
          dragging && 'bg-surface',
        )}
      >
        <GripHorizontal
          aria-hidden="true"
          className={cn(
            'h-3 w-3 text-muted-soft transition-colors group-hover:text-muted',
            dragging && 'text-muted',
          )}
        />
      </div>
    </div>
  );
}

/** The shared arithmetic, against the screen this is running on. */
function clamp(height: number) {
  return clampTableHeight(height, window.innerHeight);
}
