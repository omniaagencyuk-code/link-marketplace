import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Brand logo lockup.
 *
 * Resolved here rather than in the component because the logo renders inside
 * client components (the site header, the dashboard shell), which cannot touch
 * the filesystem. Next inlines NEXT_PUBLIC_* values at build time, so the
 * browser just receives the resolved path, or an empty string when no artwork
 * has been added yet.
 */
const LOGO_CANDIDATES = [
  '/images/press-parrot-logo.svg',
  '/images/press-parrot-logo.webp',
  '/images/press-parrot-logo.png',
];

const brandLogo =
  LOGO_CANDIDATES.find((candidate) =>
    fs.existsSync(path.join(process.cwd(), 'public', candidate)),
  ) ?? '';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BRAND_LOGO: brandLogo,
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
