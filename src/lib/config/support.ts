import { brand } from './brand';

/**
 * Live chat configuration.
 *
 * The built-in panel ships by default so there is always a way to reach
 * support. Set NEXT_PUBLIC_CHAT_PROVIDER to swap in a hosted provider once an
 * account exists - the built-in launcher then steps aside for theirs.
 */
export type ChatProvider = 'built-in' | 'crisp' | 'tawk' | 'off';

export const supportChat = {
  provider: (process.env.NEXT_PUBLIC_CHAT_PROVIDER as ChatProvider | undefined) ?? 'built-in',
  /** Crisp: Website ID from Settings -> Setup instructions. */
  crispWebsiteId: process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID ?? '',
  /** Tawk.to: the two ids in the widget's embed URL. */
  tawkPropertyId: process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID ?? '',
  tawkWidgetId: process.env.NEXT_PUBLIC_TAWK_WIDGET_ID ?? '',
  /** Shown in the built-in panel. */
  hours: 'Monday to Friday, 9am to 6pm UK time',
  responseTime: 'We usually reply within a few minutes during office hours',
  email: brand.supportEmail,
} as const;
