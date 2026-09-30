'use server';

import { requireAdminSession } from '@/lib/auth/admin-access';
import { mediaService } from '@/lib/services/media-service';
import { findArtwork } from '@/lib/cms/artwork';
import { ARTWORK, artworkPath, type ArtworkEntry } from '@/lib/cms/artwork-library';
import type { MediaAsset } from '@/lib/media/types';

/**
 * Media library actions.
 *
 * Every one is behind `requireAdminSession()`, which is what makes it sound
 * for the service underneath to run as the service role. Failures come back
 * as a message rather than an exception because the picker is a panel inside
 * a form - a thrown error there would take the whole page, and the editor's
 * unsaved copy with it.
 */

export interface MediaResult {
  ok: boolean;
  error?: string;
  asset?: MediaAsset;
}

export async function listMediaAction(): Promise<{ assets: MediaAsset[]; error?: string }> {
  await requireAdminSession();
  try {
    return { assets: await mediaService.list() };
  } catch (error) {
    return { assets: [], error: error instanceof Error ? error.message : 'Could not load media.' };
  }
}

export async function uploadMediaAction(formData: FormData): Promise<MediaResult> {
  const session = await requireAdminSession();

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'No file was received.' };

  // Dimensions are measured in the browser before upload: the server would
  // need an image decoder to learn the same thing, and the browser already
  // knows it.
  const width = Number(formData.get('width'));
  const height = Number(formData.get('height'));

  try {
    const asset = await mediaService.upload(file, {
      alt: String(formData.get('alt') ?? ''),
      width: Number.isFinite(width) && width > 0 ? Math.round(width) : undefined,
      height: Number.isFinite(height) && height > 0 ? Math.round(height) : undefined,
      uploadedBy: session.email,
    });
    return { ok: true, asset };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Upload failed.' };
  }
}

export async function updateMediaAltAction(id: string, alt: string): Promise<MediaResult> {
  await requireAdminSession();
  try {
    await mediaService.setAlt(id, alt);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save.' };
  }
}

export async function deleteMediaAction(id: string): Promise<MediaResult> {
  await requireAdminSession();
  try {
    await mediaService.remove(id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not delete.' };
  }
}

/**
 * The artwork library, with each catalogue entry resolved to a real file.
 *
 * Two places a picture can come from, checked in that order: a file committed
 * to `public/images/parrots`, and an upload somebody filed under that slug.
 * Code wins, because the version in git is the version that was reviewed.
 *
 * An entry with neither is returned with no `src`. The picker shows it greyed
 * and says so - the catalogue is also the brief for what still needs drawing,
 * and hiding the gaps would hide the brief.
 */
export async function listArtworkAction(): Promise<{
  artwork: (ArtworkEntry & { src?: string })[];
  error?: string;
}> {
  await requireAdminSession();

  let uploaded: Record<string, string> = {};
  try {
    uploaded = await mediaService.artworkUrls();
  } catch (error) {
    return {
      artwork: ARTWORK.map((entry) => ({ ...entry, src: findArtwork(artworkPath(entry.slug)) })),
      error: error instanceof Error ? error.message : 'Could not read the artwork library.',
    };
  }

  return {
    artwork: ARTWORK.map((entry) => ({
      ...entry,
      src: findArtwork(artworkPath(entry.slug)) ?? uploaded[entry.slug],
    })),
  };
}

/** File an uploaded image into one of the catalogue's slots, or clear it. */
export async function setArtworkAction(id: string, slug: string | null): Promise<MediaResult> {
  await requireAdminSession();
  try {
    await mediaService.setArtwork(id, slug);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save.' };
  }
}
