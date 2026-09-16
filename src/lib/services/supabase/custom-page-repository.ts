import { getServerClient } from '@/lib/supabase/server';
import type { CustomPageInput, CustomPageRecord } from '@/lib/cms/custom-page';
import type { PageValues } from '@/lib/cms/types';

/**
 * Custom pages, backed by Supabase.
 *
 * The table's read policy already hides drafts from anyone who is not an
 * admin. `listPublished` repeats the filter explicitly so that the two say the
 * same thing in the same place - if one changes, the difference is visible
 * rather than silent.
 */

const SELECT = 'slug, label, description, published, values, created_at, updated_at, updated_by';

interface CustomPageRow {
  slug: string;
  label: string;
  description: string | null;
  published: boolean;
  values: PageValues | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

function mapRow(row: CustomPageRow): CustomPageRecord {
  return {
    slug: row.slug,
    label: row.label,
    description: row.description ?? '',
    published: row.published,
    values: row.values ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? undefined,
  };
}

export const supabaseCustomPageRepository = {
  async listAll(): Promise<CustomPageRecord[]> {
    const supabase = await getServerClient();
    const { data } = await supabase
      .from('custom_pages')
      .select(SELECT)
      .order('updated_at', { ascending: false });
    return ((data as unknown as CustomPageRow[] | null) ?? []).map(mapRow);
  },

  async listPublished(): Promise<CustomPageRecord[]> {
    const supabase = await getServerClient();
    const { data } = await supabase
      .from('custom_pages')
      .select(SELECT)
      .eq('published', true)
      .order('updated_at', { ascending: false });
    return ((data as unknown as CustomPageRow[] | null) ?? []).map(mapRow);
  },

  async get(slug: string): Promise<CustomPageRecord | null> {
    const supabase = await getServerClient();
    const { data } = await supabase.from('custom_pages').select(SELECT).eq('slug', slug).maybeSingle();
    return data ? mapRow(data as unknown as CustomPageRow) : null;
  },

  async create(record: CustomPageRecord): Promise<CustomPageRecord> {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from('custom_pages')
      .insert({
        slug: record.slug,
        label: record.label,
        description: record.description,
        published: record.published,
        values: record.values,
        updated_by: record.updatedBy ?? null,
      })
      .select(SELECT)
      .single();

    if (error) throw new Error(`Failed to create page: ${error.message}`);
    return mapRow(data as unknown as CustomPageRow);
  },

  async updateSettings(
    slug: string,
    input: CustomPageInput,
    updatedBy?: string,
  ): Promise<CustomPageRecord | null> {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from('custom_pages')
      .update({
        label: input.label,
        description: input.description,
        published: input.published,
        updated_by: updatedBy ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('slug', slug)
      .select(SELECT)
      .maybeSingle();

    if (error) throw new Error(`Failed to update page: ${error.message}`);
    return data ? mapRow(data as unknown as CustomPageRow) : null;
  },

  async saveValues(
    slug: string,
    values: PageValues,
    updatedBy?: string,
  ): Promise<CustomPageRecord | null> {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from('custom_pages')
      .update({ values, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() })
      .eq('slug', slug)
      .select(SELECT)
      .maybeSingle();

    if (error) throw new Error(`Failed to save page content: ${error.message}`);
    return data ? mapRow(data as unknown as CustomPageRow) : null;
  },

  async delete(slug: string): Promise<boolean> {
    const supabase = await getServerClient();
    const { error } = await supabase.from('custom_pages').delete().eq('slug', slug);
    return !error;
  },
};
