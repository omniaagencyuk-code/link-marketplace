'use server';

import { requireAdminSession } from '@/lib/auth/admin-access';
import { mediaService } from '@/lib/services/media-service';
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
