import { defaultSettings } from '@/lib/data/settings';
import type { BrandSettings } from '@/lib/types';

let store: BrandSettings = { ...defaultSettings };

export const settingsService = {
  async get(): Promise<BrandSettings> {
    return store;
  },
  async update(patch: Partial<BrandSettings>): Promise<BrandSettings> {
    store = { ...store, ...patch, updatedAt: new Date().toISOString() };
    return store;
  },
};
