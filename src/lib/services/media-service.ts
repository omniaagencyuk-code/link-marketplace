import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { MEDIA_MAX_BYTES, MEDIA_MIME_TYPES, type MediaAsset } from '@/lib/media/types';

export type { MediaAsset };

/**
 * The media library.
 *
 * Files go to Supabase Storage and this table indexes them. Everything here
 * runs as the service role because the admin area carries no Supabase
 * identity - the same arrangement the rest of the admin uses, and every
 * caller is already behind `requireAdminSession()`.
 *
 * There is no mock implementation on purpose. The mock data source is a
 * `Map` in memory, and pretending to store a file in it would give an editor
 * a picture that vanished on the next deploy. `isEnabled()` says so instead,
 * and the picker falls back to typing a path, which is what the CMS did
 * before uploads existed.
 */

const BUCKET = 'media';

const SELECT =
  'id, url, storage_path, filename, mime_type, size_bytes, width, height, alt, created_at, created_by';

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapAsset(row: any): MediaAsset {
  return {
    id: row.id,
    url: row.url,
    storagePath: row.storage_path,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    alt: row.alt ?? '',
    createdAt: row.created_at,
    createdBy: row.created_by ?? undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * A filename that is safe as a storage key and still recognisable.
 *
 * Keeps the stem so an editor can find their file again, and prefixes a
 * timestamp so uploading "hero.png" twice does not overwrite the first one.
 */
function storageKey(filename: string): string {
  const cleaned = filename
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const unique = Math.random().toString(36).slice(2, 8);
  return `${stamp}/${unique}-${cleaned || 'image'}`;
}

export const mediaService = {
  /** False when uploads cannot work, so the UI can offer the old path field. */
  isEnabled(): boolean {
    return isSupabaseEnabled();
  },

  async list(limit = 60): Promise<MediaAsset[]> {
    if (!mediaService.isEnabled()) return [];
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('media_assets')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Could not load the media library: ${error.message}`);
    return ((data ?? []) as unknown[]).map(mapAsset);
  },

  /**
   * Store a file and index it.
   *
   * The type is checked here as well as on the bucket. SVG is refused: it is
   * a document rather than a picture, it can carry script, and nothing on
   * this site needs an editor-supplied one. Anything genuinely vector should
   * be committed to `/public` by a developer, where it is reviewed.
   */
  async upload(
    file: File,
    options: { alt?: string; width?: number; height?: number; uploadedBy?: string } = {},
  ): Promise<MediaAsset> {
    if (!mediaService.isEnabled()) {
      throw new Error('Uploads need the database connected on this deployment.');
    }

    const type = file.type.toLowerCase();
    if (!MEDIA_MIME_TYPES.includes(type as (typeof MEDIA_MIME_TYPES)[number])) {
      throw new Error(`${file.type || 'That file type'} is not allowed. Use PNG, JPEG, WebP, AVIF or GIF.`);
    }
    if (file.size > MEDIA_MAX_BYTES) {
      throw new Error(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MEDIA_MAX_BYTES / 1024 / 1024}MB.`,
      );
    }
    if (file.size === 0) throw new Error('That file is empty.');

    const supabase = getAdminScopedClient();
    const path = storageKey(file.name);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: type, upsert: false });

    if (uploadError) {
      // The most common cause by far, and the one with a fix the reader can act on.
      if (/bucket/i.test(uploadError.message)) {
        throw new Error(
          `Could not upload: ${uploadError.message}. Create a public bucket named "${BUCKET}" in Supabase Storage.`,
        );
      }
      throw new Error(`Could not upload: ${uploadError.message}`);
    }

    const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const { data, error } = await supabase
      .from('media_assets')
      .insert({
        storage_path: path,
        url: publicUrl.publicUrl,
        filename: file.name.slice(0, 200),
        mime_type: type,
        size_bytes: file.size,
        width: options.width ?? null,
        height: options.height ?? null,
        alt: (options.alt ?? '').slice(0, 300),
        created_by: options.uploadedBy ?? null,
      })
      .select(SELECT)
      .single();

    if (error) {
      // The file is already in the bucket, so an orphan would be left behind.
      await supabase.storage.from(BUCKET).remove([path]);
      throw new Error(`Could not save the upload: ${error.message}`);
    }

    return mapAsset(data);
  },

  /** Alt text travels with the file rather than being retyped per page. */
  async setAlt(id: string, alt: string): Promise<void> {
    if (!mediaService.isEnabled()) return;
    const supabase = getAdminScopedClient();
    await supabase.from('media_assets').update({ alt: alt.slice(0, 300) }).eq('id', id);
  },

  /**
   * Remove a file and its row.
   *
   * Pages that already reference the URL keep referencing it, and will show a
   * broken image - the same as deleting a file from `/public`. The picker
   * warns; there is no reference counting here, because a URL can be typed
   * into a rich text document by hand and counting those reliably is a bigger
   * promise than this needs to make.
   */
  async remove(id: string): Promise<void> {
    if (!mediaService.isEnabled()) return;
    const supabase = getAdminScopedClient();

    const { data } = await supabase
      .from('media_assets')
      .select('storage_path')
      .eq('id', id)
      .maybeSingle();

    if (data?.storage_path) {
      await supabase.storage.from(BUCKET).remove([data.storage_path as string]);
    }
    await supabase.from('media_assets').delete().eq('id', id);
  },
};
