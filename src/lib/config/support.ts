import { brand } from './brand';

/**
 * Live chat configuration.
 *
 * Tawk.to, and the ids are the ones in the widget's embed URL:
 *
 *   https://embed.tawk.to/<property>/<widget>
 *
 * They are defaults in the code rather than variables somebody has to set,
 * because neither is a secret - both are in the page source of every site
 * using Tawk, which is where a widget id has to be to work at all - and a
 * chat that only appears in production is a chat nobody tests before a
 * customer does. The environment can still override either, which is how
 * you would point a preview at a second property.
 *
 * `off` is the way to turn it off.
 */
export type ChatProvider = 'crisp' | 'tawk' | 'off';

export const supportChat = {
  provider: (process.env.NEXT_PUBLIC_CHAT_PROVIDER as ChatProvider | undefined) ?? 'tawk',
  /** Crisp: Website ID from Settings -> Setup instructions. */
  crispWebsiteId: process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID ?? '',
  /** Tawk.to: the two ids in the widget's embed URL. */
  tawkPropertyId: process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID ?? '6ad22e9de0bdb134cccb13f0',
  tawkWidgetId: process.env.NEXT_PUBLIC_TAWK_WIDGET_ID ?? '1k52gc5sp',
  email: brand.supportEmail,
} as const;
