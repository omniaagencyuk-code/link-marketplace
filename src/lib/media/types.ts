/**
 * What both sides of the media library agree on.
 *
 * Deliberately its own module with no imports. The picker runs in the
 * browser and needs the shape of an asset and the size limit; the service
 * needs the same things and also the service-role Supabase client. Sharing
 * them through the service would drag that client into the client bundle,
 * which is exactly what the build refused - and rightly, because the secret
 * key lives in there.
 */

export interface MediaAsset {
  id: string;
  url: string;
  storagePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  alt: string;
  createdAt: string;
  createdBy?: string;
}

/** What the bucket accepts. SVG is deliberately absent - see `mediaService.upload`. */
export const MEDIA_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;

export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;

/** The `accept` attribute for a file input, kept in step with the list above. */
export const MEDIA_ACCEPT = MEDIA_MIME_TYPES.join(',');
