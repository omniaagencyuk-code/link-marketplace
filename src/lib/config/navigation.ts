import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bookmark,
  CreditCard,
  FolderTree,
  Globe,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  UserCircle,
  Users,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  description?: string;
  exact?: boolean;
}

/** Primary marketing navigation (site header). */
export const mainNav: NavItem[] = [
  { label: 'Browse Sites', href: '/websites' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Resources', href: '/resources' },
];

/** Signed-in customer area. */
export const dashboardNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, exact: true },
  { label: 'Browse Websites', href: '/websites', icon: Globe },
  { label: 'Saved Websites', href: '/dashboard/saved', icon: Bookmark },
  { label: 'Orders', href: '/dashboard/orders', icon: Package },
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Account', href: '/dashboard/account', icon: UserCircle },
];

/** Internal admin area. */
export const adminNav: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: BarChart3, exact: true },
  { label: 'Websites', href: '/admin/websites', icon: Globe },
  { label: 'Orders', href: '/admin/orders', icon: ShoppingCart },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Categories', href: '/admin/categories', icon: FolderTree },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: 'Marketplace',
    items: [
      { label: 'Browse websites', href: '/websites' },
      { label: 'Guest posts', href: '/websites?service=guest-post' },
      { label: 'Niche edits', href: '/websites?service=niche-edit' },
      { label: 'Digital PR', href: '/websites?service=digital-pr' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Company',
    items: [
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Resources', href: '/resources' },
      { label: 'Contact sales', href: '/resources#contact' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Log in', href: '/login' },
      { label: 'Create account', href: '/signup' },
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Orders', href: '/dashboard/orders' },
    ],
  },
];
