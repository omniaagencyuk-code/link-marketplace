import { mockAdmin, mockCustomer, users } from '@/lib/data/users';
import type { UserProfile } from '@/lib/types';

export const userService = {
  async getAll(): Promise<UserProfile[]> {
    return users;
  },
  async getById(id: string): Promise<UserProfile | null> {
    return users.find((user) => user.id === id) ?? null;
  },
  /** The signed-in user while mock auth is enabled. */
  async getCurrent(): Promise<UserProfile> {
    return mockCustomer;
  },
  async getCurrentAdmin(): Promise<UserProfile> {
    return mockAdmin;
  },
};
