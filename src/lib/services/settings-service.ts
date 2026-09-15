import { defaultSettings } from '@/lib/data/settings';
import type { BrandSettings } from '@/lib/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { supabaseSettingsRepository } from './supabase/orders-repository';

let store: BrandSettings = { ...defaultSettings };

export const settingsService = {
  async get(): Promise<BrandSettings> {
    if (isSupabaseEnabled()) return supabaseSettingsRepository.get();

    return store;
  },
  async update(patch: Partial<BrandSettings>): Promise<BrandSettings> {
    if (isSupabaseEnabled()) return supabaseSettingsRepository.update(patch);

    store = { ...store, ...patch, updatedAt: new Date().toISOString() };
    return store;
  },
};
