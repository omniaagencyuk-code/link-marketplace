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

/**
 * Where an uploaded image may be served from.
 *
 * The media library stores files in Supabase Storage, so a picture chosen in
 * the admin has that project's hostname. Derived from the configured URL
 * rather than hard-coded, and simply absent when Supabase is not configured -
 * in which case there are no uploads to serve either.
 */
const supabaseHost = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: supabaseHost
    ? {
        remotePatterns: [
          { protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' },
        ],
      }
    : undefined,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BRAND_LOGO: brandLogo,
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
    /*
      Uploading a mailbox.

      The default is 1MB, which a Takeout export passes in the first second
      and fails with a browser-level "page couldn't load" that names no cause.
      Vercel refuses a request body over 4.5MB whatever this says, so this is
      headroom rather than a solution: the admin splits an export into batches
      under 3MB and uploads them one at a time.
    */
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default nextConfig;
