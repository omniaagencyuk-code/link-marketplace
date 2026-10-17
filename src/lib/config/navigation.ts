import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bookmark,
  Calculator,
  CreditCard,
  FileCode2,
  FileText,
  FolderTree,
  Globe,
  Inbox,
  LayoutDashboard,
  Menu,
  Network,
  Newspaper,
  Package,
  PenLine,
  Radar,
  RefreshCw,
  Settings,
  ShieldCheck,
  Store,
  ShoppingCart,
  Target,
  TicketPercent,
  UserCircle,
  Users,
  Tags,
  ClipboardList,
  MessageSquareText,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  description?: string;
  exact?: boolean;
  /**
   * A live count to show beside the label.
   *
   * Named rather than a number, because this file is a plain config imported
   * by server components and the figure lives in a client-side provider. The
   * sidebar resolves the name against its own hooks; nothing here reads state.
   */
  badge?: 'order-draft' | 'pricing-enquiries';
}

export interface NavGroup extends NavItem {
  /** Rendered as a dropdown in the header when present. */
  children?: NavItem[];
}

/**
 * Primary marketing navigation.
 *
 * "Marketplace" points at /guest-posts rather than /marketplace. The
 * inventory needs an account: `proxy.ts` counts `/marketplace` as an
 * inventory path and 307s a signed-out visitor to /signup, so the item would
 * lead to a wall having shown them nothing. /guest-posts and its niche pages
 * describe the same inventory from masked data, publicly, and end in the same
 * signup with somewhere to come back to.
 *
 * Signed in, the header's own member nav links straight to /marketplace, so
 * nobody with an account takes the long way round.
 *
 * So /guest-posts is named twice - once as a service, once as the way in to
 * the inventory - because one page is doing both jobs. The two labels answer
 * different questions, "what do you sell" and "show me what you have", and
 * the day the public preview gets a page of its own this is one href to
 * change rather than a menu to rearrange.
 *
 * Six top-level items, which is what the two marketplaces this was measured
 * against carry: PressWhizz and Bazoom both keep services in a dropdown and
 * give the inventory, the pricing and the writing a slot each.
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
        label: 'Buy Backlinks',
        href: '/buy-backlinks',
        description: 'Choose the publisher and pay per placement.',
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
      /*
        In the dropdown, not the footer alone, which is where it was.
        Gambling is one of the seven niches marked sensitive in
        accepted-niches - the ones a publisher quotes a separate rate for -
        so it is the service whose own page is most worth finding, and the
        one competitor with a service menu this long gives iGaming a slot in
        it.
      */
      {
        label: 'Gambling & iGaming',
        href: '/gambling-link-building',
        description: 'Casino, betting and iGaming placements.',
      },
    ],
  },
  { label: 'Marketplace', href: '/guest-posts' },
  /*
    The free planner, top level, because being free is the whole of what it
    offers a stranger and a dropdown is where that gets hidden. Both
    marketplaces measured against carry their free tool sitewide; this is
    the seventh item here, so if the header ever looks tight it is the one
    to demote into Resources from /admin/menus.
  */
  { label: 'Free Planner', href: '/link-building-planner' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  {
    /*
      A dropdown rather than a link, because /resources is an index with
      categories and the two category links below are the ones worth
      reaching in one click. The parent keeps its own href: a heading that
      cannot be clicked is a heading somebody clicks anyway.
    */
    label: 'Resources',
    href: '/resources',
    children: [
      {
        label: 'Blog & Guides',
        href: '/resources',
        description: 'Everything we publish, newest first.',
      },
      {
        label: 'Link Building Guides',
        href: '/resources?category=link-building',
        description: 'How placements, anchors and outreach work.',
      },
      {
        label: 'SEO Resources',
        href: '/resources?category=seo',
        description: 'The wider picture around links.',
      },
      /* Up out of the footer. It is a public page that explains the figures
         every listing is sorted by, and it was reachable only from the
         bottom of the site. */
      {
        label: 'Link Building Metrics',
        href: '/link-building-metrics',
        description: 'What DR, traffic and referring domains mean.',
      },
    ],
  },
  { label: 'For Agencies', href: '/link-building-agencies' },
];

/**
 * Signed-in shortcuts, replacing the marketing nav once there is an account.
 *
 * Here rather than inside the header, which is where it used to live: it is
 * navigation configuration like the three arrays around it, and the menu
 * editor needs to read it to show an editor what ships.
 */
export const memberNav: NavItem[] = [
  { label: 'Marketplace', href: '/marketplace' },
  /*
    The planner, in the header, for the reason the gap finder is not: it
    costs nothing to open. No Ahrefs call, no model, no crawl - so a link
    somebody presses out of curiosity spends nothing. Every gap run spends
    units from `gap_settings`, and a header link is an invitation to press
    it idly, so it stays in the dashboard rail where somebody is already
    working.
  */
  { label: 'Planner', href: '/dashboard/planner' },
  { label: 'Orders', href: '/dashboard/orders' },
  { label: 'Content', href: '/dashboard/content' },
  /*
    "Saved Sites", which is what the dashboard rail and the page itself call
    it. This said "Projects" and pointed here, while the planner's actual
    projects are somewhere else - one page under two names, and the second
    name belonged to a different feature.
  */
  { label: 'Saved Sites', href: '/dashboard/saved' },
];

export const dashboardNav: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    exact: true,
  },
  { label: 'Marketplace', href: '/marketplace', icon: Globe },
  /* Under Marketplace, because finding a publisher and planning a link
     against it are the same errand an hour apart. */
  {
    label: 'Link Building Planner',
    href: '/dashboard/planner',
    icon: ClipboardList,
  },
  { label: 'Content', href: '/dashboard/content', icon: PenLine },
  /*
    The basket and the order history are the same page: the draft sits at the
    top of /dashboard/orders with submitted orders under it. So this is one
    entry carrying a count rather than two pointing at the same place.
  */
  {
    label: 'Orders',
    href: '/dashboard/orders',
    icon: Package,
    badge: 'order-draft',
  },
  { label: 'Link gap finder', href: '/dashboard/link-gap', icon: Radar },
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
  /*
    Beside Pages and Blog, which is the group of things an editor changes
    without a deploy. The header and footer were the last part of the public
    site that still needed one.
  */
  { label: 'Menus', href: '/admin/menus', icon: Menu },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Categories', href: '/admin/categories', icon: FolderTree },
  { label: 'Publisher inbox', href: '/admin/sourcing', icon: Inbox },
  /*
    Beside the inbox, not inside it. Both are publishers offering us a site,
    and that is where the likeness ends: the inbox holds emails a model read
    into drafts, each stamped with the prompt version that read it, and these
    were typed by the publisher and read by nobody. `listing_drafts.email_id`
    is not null, so they could not be merged even if it were a good idea.
  */
  { label: 'Publisher offers', href: '/admin/publisher-offers', icon: Store },
  { label: 'Sales Centre', href: '/admin/sales', icon: Target },
  /*
    Beside the Sales Centre, which is the outbound half of the same job.
    These are people who wrote to us first, which is why they are not in
    it: a prospect is a company we decided to approach, and collapsing the
    two would mean never being able to tell them apart.
  */
  {
    label: 'Pricing enquiries',
    href: '/admin/enquiries',
    icon: MessageSquareText,
    badge: 'pricing-enquiries',
  },
  { label: 'Pricing', href: '/admin/pricing', icon: Calculator },
  { label: 'Promo codes', href: '/admin/promo-codes', icon: TicketPercent },
  { label: 'Ahrefs refresh', href: '/admin/refresh', icon: RefreshCw },
  { label: 'Link monitor', href: '/admin/link-monitor', icon: ShieldCheck },
  { label: 'Link gap finder', href: '/admin/link-gap', icon: Radar },
  { label: 'Majestic', href: '/admin/majestic', icon: Network },
  // Beside Majestic, because they answer the same question from different
  // evidence: what is this site about. Majestic reads who links to it; this
  // reads the site.
  { label: 'Categorise', href: '/admin/categorise', icon: Tags },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

/**
 * The columns across the bottom of every page.
 *
 * Five columns, which is the shape both marketplaces measured against run -
 * and they carry a column's worth that we have no page for yet: company
 * (about, careers, case studies, testimonials), support and a partner
 * programme. Those are pages to write, not links to invent, so nothing here
 * points at one that does not exist. The refund policy was on that list and
 * is now a page, under Legal.
 */
export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: 'Services',
    items: [
      { label: 'Link building', href: '/link-building' },
      { label: 'Buy backlinks', href: '/buy-backlinks' },
      { label: 'Guest posts', href: '/guest-posts' },
      { label: 'Niche edits', href: '/niche-edits' },
      { label: 'Content writing', href: '/content-writing' },
      { label: 'Digital PR', href: '/digital-pr' },
      { label: 'Gambling link building', href: '/gambling-link-building' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { label: 'How it works', href: '/how-it-works' },
      { label: 'Pricing', href: '/pricing' },
      /* The same destination and the same wording as the header's, because a
         visitor who read one and then looked for the other in the footer
         should not have to work out that they are the same place. */
      { label: 'Marketplace', href: '/guest-posts' },
      { label: 'Link building planner', href: '/link-building-planner' },
      { label: 'Link building metrics', href: '/link-building-metrics' },
      { label: 'For agencies', href: '/link-building-agencies' },
      /* The one link in the footer addressed to somebody selling rather
         than buying. In Platform rather than a column of its own, because
         one publisher link does not make a column, and the footer is where
         a publisher who has read a listing goes looking for it. */
      { label: 'List your site', href: '/list-your-site' },
    ],
  },
  {
    title: 'Resources',
    items: [
      { label: 'Blog', href: '/resources' },
      {
        label: 'Link building guides',
        href: '/resources?category=link-building',
      },
      { label: 'SEO resources', href: '/resources?category=seo' },
      /* An anchor on the blog index, which is where the only contact form on
         the public site lives. Both marketplaces measured against carry a
         contact page sitewide; this is the honest link until there is one. */
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
  {
    title: 'Legal',
    items: [
      { label: 'Terms of service', href: '/terms' },
      /* Above privacy, because it is the one legal page somebody comes
         looking for with a question rather than a worry, and the only one
         that answers what happens to their money. */
      { label: 'Refund policy', href: '/refund-policy' },
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Cookie policy', href: '/cookies' },
    ],
  },
];
