import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bookmark,
  CreditCard,
  FileText,
  FileCode2,
  Newspaper,
  FolderTree,
  Globe,
  LayoutDashboard,
  Package,
  PenLine,
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

export interface NavGroup extends NavItem {
  /** Rendered as a dropdown in the header when present. */
  children?: NavItem[];
}

/**
 * Primary marketing navigation.
 *
 * Marketplace stays in the menu deliberately: signed-out visitors clicking it
 * reach the gateway at /marketplace, which is a conversion page rather than a
 * dead end.
 */
export const mainNav: NavGroup[] = [
  {
    label: 'Services',
    href: '/link-building',
    children: [
      {
        label: 'Link Building',
        href: '/link-building',
        description: 'The full service, end to end.',
      },
      {
        label: 'Guest Posts',
        href: '/guest-posts',
        description: 'Contextual links in new articles.',
      },
      {
        label: 'Niche Edits',
        href: '/niche-edits',
        description: 'Links added to existing pages.',
      },
      {
        label: 'Content Writing',
        href: '/content-writing',
        description: 'SEO content, with or without a placement.',
      },
      {
        label: 'Digital PR',
        href: '/digital-pr',
        description: 'Editorial coverage and commentary.',
      },
    ],
  },
  { label: 'Marketplace', href: '/marketplace' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Resources', href: '/resources' },
  { label: 'For Agencies', href: '/link-building-agencies' },
];

/** Signed-in customer area. */
export const dashboardNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, exact: true },
  { label: 'Marketplace', href: '/marketplace', icon: Globe },
  { label: 'Content', href: '/dashboard/content', icon: PenLine },
  { label: 'Orders', href: '/dashboard/orders', icon: Package },
  { label: 'Saved Sites', href: '/dashboard/saved', icon: Bookmark },
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Account', href: '/dashboard/account', icon: UserCircle },
];

/** Internal admin area. */
export const adminNav: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: BarChart3, exact: true },
  { label: 'Websites', href: '/admin/websites', icon: Globe },
  { label: 'Orders', href: '/admin/orders', icon: ShoppingCart },
  { label: 'Content Orders', href: '/admin/content-orders', icon: FileText },
  { label: 'Pages', href: '/admin/pages', icon: FileCode2 },
  { label: 'Blog', href: '/admin/blog', icon: Newspaper },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Categories', href: '/admin/categories', icon: FolderTree },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: 'Services',
    items: [
      { label: 'Link building', href: '/link-building' },
      { label: 'Guest posts', href: '/guest-posts' },
      { label: 'Niche edits', href: '/niche-edits' },
      { label: 'Content writing', href: '/content-writing' },
      { label: 'Digital PR', href: '/digital-pr' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Marketplace', href: '/marketplace' },
      { label: 'For agencies', href: '/link-building-agencies' },
    ],
  },
  {
    title: 'Resources',
    items: [
      { label: 'Blog', href: '/resources' },
      { label: 'Link building guides', href: '/resources?category=link-building' },
      { label: 'SEO resources', href: '/resources?category=seo' },
      { label: 'Contact', href: '/resources#contact' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Log in', href: '/login' },
      { label: 'Create account', href: '/signup' },
    ],
  },
];
