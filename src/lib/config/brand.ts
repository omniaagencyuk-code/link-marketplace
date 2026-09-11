/**
 * Central brand configuration.
 *
 * Everything that is specific to the *company* running this marketplace lives
 * here. Changing the brand name, colours, logo, support email or social links
 * should never require touching a component.
 *
 * Colours are exposed to CSS through `src/app/globals.css` (see the
 * `--brand-*` custom properties) so keep the two in sync if you change them.
 */

export interface BrandColours {
  /** Primary brand colour - dark navy. Used for headers, dark sections, CTAs. */
  primary: string;
  /** Accent colour - emerald/turquoise. Used for highlights and key actions. */
  accent: string;
  /** Soft off-white page background. */
  surface: string;
}

export interface CompanyDetails {
  legalName: string;
  registrationNumber: string;
  vatNumber: string;
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
  /** One-line positioning statement. */
  tagline: string;
  /** Default meta description for the site. */
  description: string;
  /** Path to the logo mark. The built-in logo is drawn in SVG - see Logo component. */
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
}

export const brand: BrandConfig = {
  name: 'LinkMarket',
  legalNameShort: 'LinkMarket',
  tagline: 'The link building marketplace for serious SEOs',
  description:
    'Buy high quality guest posts, niche edits and digital PR placements on 5,000+ manually vetted websites. Transparent metrics, fixed pricing and fast turnaround.',
  logo: { light: '/logo.svg', dark: '/logo-dark.svg', useInlineMark: true },
  favicon: '/icon.svg',
  colours: {
    primary: '#0B1B2B',
    accent: '#10B981',
    surface: '#F7F9FB',
  },
  supportEmail: 'support@linkmarket.io',
  salesEmail: 'sales@linkmarket.io',
  phone: '+44 20 3695 0000',
  company: {
    legalName: 'LinkMarket Technologies Ltd',
    registrationNumber: '14829301',
    vatNumber: 'GB 421 8832 07',
    addressLines: ['Floor 3, 86-90 Paul Street', 'London', 'EC2A 4NE'],
    country: 'United Kingdom',
  },
  social: {
    x: 'https://x.com/linkmarket',
    linkedin: 'https://www.linkedin.com/company/linkmarket',
    youtube: 'https://www.youtube.com/@linkmarket',
  },
  currency: 'GBP',
  locale: 'en-GB',
};

/** Canonical site URL, used for metadata, sitemap and robots. */
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';
