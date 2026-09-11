import {
  categories,
  categoryBySlug,
  featuredCategories,
  overflowCategories,
} from '@/lib/data/categories';
import type { Category, NicheSlug } from '@/lib/types';

export const categoryService = {
  async getAll(): Promise<Category[]> {
    return [...categories].sort((a, b) => a.position - b.position);
  },
  async getFeatured(): Promise<Category[]> {
    return featuredCategories;
  },
  async getOverflow(): Promise<Category[]> {
    return overflowCategories;
  },
  async getBySlug(slug: NicheSlug): Promise<Category | null> {
    return categoryBySlug.get(slug) ?? null;
  },
};
