import { mockAdmin, mockCustomer, users as seedUsers } from '@/lib/data/users';
import { isAdminEmail } from '@/lib/auth/admin-access';
import type { UserProfile } from '@/lib/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { supabaseUserRepository } from './supabase/orders-repository';

const store: UserProfile[] = seedUsers.map((user) => ({ ...user }));

let idSequence = 0;

function initialsFor(name: string, email: string) {
  const source = name.trim() || email.split('@')[0]?.replace(/[._-]+/g, ' ') || '';
  const parts = source.split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('');
  return (initials || email.charAt(0)).toUpperCase();
}

function nameFromEmail(email: string) {
  const local = email.split('@')[0] ?? email;
  return local
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const userService = {
  async getAll(): Promise<UserProfile[]> {
    if (isSupabaseEnabled()) return supabaseUserRepository.getAll();

    return [...store];
  },

  async getById(id: string): Promise<UserProfile | null> {
    if (isSupabaseEnabled()) return supabaseUserRepository.getById(id);

    return store.find((user) => user.id === id) ?? null;
  },

  async getByEmail(email: string): Promise<UserProfile | null> {
    if (isSupabaseEnabled()) return supabaseUserRepository.getByEmail(email);

    const needle = email.trim().toLowerCase();
    return store.find((user) => user.email.toLowerCase() === needle) ?? null;
  },

  /**
   * Resolve the account behind a sign-in.
   *
   * Mock credentials: any address signs in, and an unrecognised one creates a
   * profile so the app is explorable. Replace with a Supabase Auth lookup and
   * a `profiles` row read; the return shape stays the same.
   */
  async findOrCreateByEmail(
    email: string,
    details: { fullName?: string; company?: string } = {},
  ): Promise<UserProfile> {
    const address = email.trim();
    const existing = await userService.getByEmail(address);
    if (existing) return existing;

    const fullName = details.fullName ?? nameFromEmail(address);
    const now = new Date().toISOString();
    const user: UserProfile = {
      id: `usr_${Date.now().toString(36)}${(idSequence++).toString(36)}`,
      email: address,
      fullName,
      company: details.company,
      // The admin allowlist is the single source of truth for elevated access.
      role: isAdminEmail(address) ? 'admin' : 'customer',
      avatarInitials: initialsFor(fullName, address),
      plan: 'starter',
      createdAt: now,
      updatedAt: now,
    };
    store.push(user);
    return user;
  },

  /**
   * The demo customer fixture.
   *
   * Only for seed data and fixtures. Anything that needs the *signed-in*
   * account must use `getCurrentUser()` from `lib/auth/customer-access`, which
   * reads the verified session cookie.
   */
  async getCurrent(): Promise<UserProfile> {
    return mockCustomer;
  },

  async getCurrentAdmin(): Promise<UserProfile> {
    return mockAdmin;
  },
};
