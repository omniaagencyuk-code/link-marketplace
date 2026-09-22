/**
 * Central brand configuration.
 *
 * Everything specific to the *company* running this marketplace lives here.
 * Changing the brand name, domain, logo, favicon, colours, support email or
 * social links should never require touching a component.
 *
 * Colours are also declared in `src/app/globals.css` under `@theme` so
 * Tailwind can generate utilities from them. Keep the two in sync.
 */

export interface BrandColours {
  /** Primary brand colour - dark navy. Headers, dark sections, primary CTAs. */
  primary: string;
  /** Accent colour - parrot green. Highlights and key actions. */
  accent: string;
  /** Secondary accent - coral. Used sparingly: the logo beak, badges. */
  secondary: string;
  /** Soft off-white page background. */
  surface: string;
}

export interface CompanyDetails {
  legalName: string;
  /** TODO: add once the company is registered. Hidden while empty. */
  registrationNumber: string;
  /** TODO: add once VAT registered. Hidden while empty. */
  vatNumber: string;
  /** TODO: trading address for the footer. Hidden while empty. */
  addressLines: string[];
  country: string;
}

export interface SocialLinks {
  x?: string;
  linkedin?: string;
  youtube?: string;
  github?: string;
}

export interface BrandConfig {
  /** Short brand name shown in the logo and throughout the UI. */
  name: string;
  /** Used in <title> suffixes and structured data. */
  legalNameShort: string;
  /** Bare domain, no protocol. Used in copy and email addresses. */
  domain: string;
  /** One-line positioning statement. */
  tagline: string;
  /** Default meta description for the site. */
  description: string;
  /** The built-in mark is drawn in SVG - see the Logo component. */
  logo: { light: string; dark: string; useInlineMark: boolean };
  favicon: string;
  colours: BrandColours;
  supportEmail: string;
  salesEmail: string;
  phone: string;
  company: CompanyDetails;
  social: SocialLinks;
  /** ISO 4217 currency code used across the marketplace. */
  currency: 'GBP' | 'USD' | 'EUR';
  locale: string;
  /** Prefix for browser storage keys, so a rename cannot collide. */
  storageNamespace: string;
}

export const brand: BrandConfig = {
  name: 'Press Parrot',
  legalNameShort: 'Press Parrot',
  domain: 'pressparrot.com',
  tagline: 'The link building marketplace for serious SEOs',
  description:
    'Buy high quality guest posts, niche edits and digital PR placements on 5,000+ manually vetted websites. Transparent metrics, fixed pricing and fast turnaround.',
  logo: { light: '/logo.svg', dark: '/logo-dark.svg', useInlineMark: true },
  favicon: '/icon.png',
  colours: {
    primary: '#0B1B2B',
    accent: '#10B981',
    secondary: '#F4633A',
    surface: '#F7F9FB',
  },
  supportEmail: 'support@pressparrot.com',
  salesEmail: 'sales@pressparrot.com',
  phone: '',
  company: {
    legalName: 'Press Parrot Ltd',
    registrationNumber: '',
    vatNumber: '',
    addressLines: [],
    country: 'United Kingdom',
  },
  social: {
    x: 'https://x.com/pressparrot',
    linkedin: 'https://www.linkedin.com/company/pressparrot',
  },
  currency: 'GBP',
  locale: 'en-GB',
  storageNamespace: 'pressparrot',
};

/** Canonical site URL, used for metadata, sitemap and robots. */
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';

/** Email domain, derived so admin checks follow a rename automatically. */
export const brandEmailDomain = brand.supportEmail.split('@')[1] ?? brand.domain;

/** Build a namespaced browser storage key. */
export function storageKey(name: string) {
  return `${brand.storageNamespace}.${name}`;
}
