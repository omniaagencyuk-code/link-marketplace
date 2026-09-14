import type { Metadata, Viewport } from 'next';
import { Caveat, Inter } from 'next/font/google';
import { AppProviders } from '@/lib/providers/app-providers';
import { SupportChat } from '@/components/support/support-chat';
import { brand, siteUrl } from '@/lib/config/brand';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

/** Used only for the hand-drawn annotations. One weight, latin only. */
const caveat = Caveat({
  subsets: ['latin'],
  weight: ['600'],
  display: 'swap',
  variable: '--font-caveat',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${brand.name} | ${brand.tagline}`,
    template: `%s | ${brand.name}`,
  },
  description: brand.description,
  applicationName: brand.name,
  keywords: [
    'link building marketplace',
    'buy guest posts',
    'niche edits',
    'digital PR placements',
    'SEO backlinks',
  ],
  authors: [{ name: brand.company.legalName }],
  openGraph: {
    type: 'website',
    siteName: brand.name,
    title: `${brand.name} | ${brand.tagline}`,
    description: brand.description,
    url: siteUrl,
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${brand.name} | ${brand.tagline}`,
    description: brand.description,
  },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  themeColor: brand.colours.primary,
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${caveat.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <AppProviders>
          {children}
          <SupportChat />
        </AppProviders>
      </body>
    </html>
  );
}
