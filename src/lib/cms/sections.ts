/**
 * A page's shape, as data.
 *
 * Until now a page's sections were a TypeScript literal in the CMS registry:
 * the editor rendered the sections the code declared, in the order the code
 * declared them, and adding one to a page was a deploy. These types describe
 * the same idea held in a table instead, so that an administrator can reach
 * it.
 *
 * Nothing here knows what a component looks like. A section names a component
 * and carries its values; the registry decides what that component is and the
 * frontend decides how it draws. That separation is the reason an
 * administrator cannot change a font: there is nowhere in this file to put
 * one.
 */

/** How a section arrives on screen. Fixed sets, never a duration or a curve. */
export const ENTRANCES = ['none', 'fade-up', 'fade-in', 'slide-left', 'slide-right', 'scale-in', 'stagger'] as const;
export const SPEEDS = ['subtle', 'normal', 'slow'] as const;
export const DELAYS = ['none', 'small', 'medium'] as const;

export type Entrance = (typeof ENTRANCES)[number];
export type Speed = (typeof SPEEDS)[number];
export type Delay = (typeof DELAYS)[number];

export interface Animation {
  entrance: Entrance;
  speed: Speed;
  delay: Delay;
}

/** Still, until somebody chooses otherwise. */
export const NO_ANIMATION: Animation = { entrance: 'none', speed: 'normal', delay: 'none' };

/** What a component's fields hold. Shaped by that component's own schema. */
export type SectionValues = Record<string, unknown>;

export interface PageSection {
  id: string;
  pageSlug: string;
  /** A key in the component registry. */
  component: string;
  variant: string;
  position: number;
  /** Switched off, not deleted: the content is still here when it comes back. */
  hidden: boolean;
  /**
   * Cannot be deleted or moved. Its content, images, links and animation stay
   * editable - a locked hero is still a hero somebody writes.
   */
  locked: boolean;
  animation: Animation;
  /** Which of the CMS palette's named choices this section carries. */
  style: SectionStyle;
  values: SectionValues;
  /** Set means this row renders a global section rather than its own values. */
  globalId?: string;
  /** Filled in by the reader when `globalId` is set, so the page can render. */
  global?: GlobalSection;
  updatedAt: string;
  updatedBy?: string;
}

export interface GlobalSection {
  id: string;
  name: string;
  component: string;
  variant: string;
  animation: Animation;
  style: SectionStyle;
  values: SectionValues;
  updatedAt: string;
  updatedBy?: string;
}

/**
 * What actually renders, once a reference has been followed.
 *
 * A section pointing at a global renders the global's component, variant and
 * values - that is what makes it global. Its animation is its own, because
 * the same call to action arriving at the end of a long article and at the
 * top of a short page wants a different entrance, and that is a property of
 * where it sits rather than of what it says.
 */
export function resolveSection(section: PageSection): {
  component: string;
  variant: string;
  values: SectionValues;
  animation: Animation;
  style: SectionStyle;
} {
  const source = section.global ?? section;
  return {
    component: source.component,
    variant: source.variant,
    values: source.values,
    animation: section.animation,
    /*
      The global's look, like its content. A shared call to action being the
      same colour everywhere is most of what makes it shared - and unlike the
      entrance, which is about where a section sits, the colour is part of
      what the section *is*.
    */
    style: source.style,
  };
}

import type { SectionStyle } from './style';

/** An animation read back from the database, which is to say from jsonb. */
export function readAnimation(raw: unknown): Animation {
  const stored = isRecord(raw) ? raw : {};
  return {
    entrance: pick(stored.entrance, ENTRANCES, NO_ANIMATION.entrance),
    speed: pick(stored.speed, SPEEDS, NO_ANIMATION.speed),
    delay: pick(stored.delay, DELAYS, NO_ANIMATION.delay),
  };
}

/** Values are only ever an object. The column says so too, as a backstop. */
export function readValues(raw: unknown): SectionValues {
  return isRecord(raw) ? raw : {};
}

/**
 * A section's look, read back from jsonb.
 *
 * Re-exported here rather than reimplemented: `style.ts` owns what the
 * palette is, and this file owns what a section is. They meet at one type.
 */
export { readStyle, NO_STYLE } from './style';
export type { SectionStyle } from './style';

function pick<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
