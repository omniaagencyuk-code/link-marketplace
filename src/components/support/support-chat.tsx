'use client';

import Script from 'next/script';
import { supportChat } from '@/lib/config/support';

/**
 * The live chat widget.
 *
 * Nothing of ours is drawn any more. Tawk.to's own launcher is the chat on
 * this site, and this component exists only to put their snippet on the
 * page - which is why it renders a script and no markup.
 *
 * ## Where the snippet ends up, and why that does not matter
 *
 * Tawk's instructions say to paste it before the closing `</body>`. Their
 * code does not depend on that: it creates a script element and inserts it
 * before the first `<script>` already in the document, wherever this one
 * runs from. `lazyOnload` therefore costs the page nothing and the widget
 * arrives a moment after the content it sits on top of, which is the right
 * order for a thing nobody came here to see.
 *
 * ## The panel that used to be here
 *
 * There was a built-in launcher - a bubble, a message box and an email
 * hand-off - that shipped so the site always had some way to reach support
 * before a provider existed. One exists now, so it is gone rather than left
 * behind a flag: two chat widgets that can both be switched on is a
 * configuration mistake waiting to happen, and the one that would win is
 * whichever somebody set last.
 */
export function SupportChat() {
  const { provider } = supportChat;

  if (provider === 'off') return null;

  if (provider === 'crisp' && supportChat.crispWebsiteId) {
    return (
      <Script id="crisp-chat" strategy="lazyOnload">
        {`window.$crisp=[];window.CRISP_WEBSITE_ID="${supportChat.crispWebsiteId}";
          (function(){var d=document,s=d.createElement("script");
          s.src="https://client.crisp.chat/l.js";s.async=1;
          d.getElementsByTagName("head")[0].appendChild(s);})();`}
      </Script>
    );
  }

  if (provider === 'tawk' && supportChat.tawkPropertyId && supportChat.tawkWidgetId) {
    return (
      <Script id="tawk-chat" strategy="lazyOnload">
        {`var Tawk_API=Tawk_API||{},Tawk_LoadStart=new Date();
          (function(){var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
          s1.async=true;s1.src="https://embed.tawk.to/${supportChat.tawkPropertyId}/${supportChat.tawkWidgetId}";
          s1.charset="UTF-8";s1.setAttribute("crossorigin","*");s0.parentNode.insertBefore(s1,s0);})();`}
      </Script>
    );
  }

  /*
    A provider named with nothing to load. Silence rather than a fallback
    widget: a chat launcher that opens a mail client is not the live chat
    the page is promising, and somebody has to notice the ids are missing.
  */
  return null;
}
