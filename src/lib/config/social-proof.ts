/**
 * Customer logos and testimonials.
 *
 * Both lists are empty on purpose. Nothing on the homepage should imply a
 * customer relationship or quote that does not exist, so the components fall
 * back to clearly-labelled placeholders until real, permissioned assets are
 * dropped in here.
 */

export interface CustomerLogo {
  name: string;
  /** Path under /public, e.g. "/images/logos/acme.svg". */
  src: string;
  /** Rendered width in pixels; height scales automatically. */
  width?: number;
}

export interface Testimonial {
  quote: string;
  authorName: string;
  authorRole: string;
  /** Optional path under /public. Initials are used when absent. */
  avatarSrc?: string;
  rating: 1 | 2 | 3 | 4 | 5;
}

/** Add real customer logos here once you have written permission to use them. */
export const customerLogos: CustomerLogo[] = [];

/** Add real, attributable quotes here. */
export const testimonials: Testimonial[] = [];
