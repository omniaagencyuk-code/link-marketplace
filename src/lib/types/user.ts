export type UserRole = 'customer' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  company?: string;
  role: UserRole;
  avatarInitials: string;
  /** Account plan, mirrors the pricing page tiers. */
  plan: 'starter' | 'growth' | 'agency';
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: UserProfile | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
}
