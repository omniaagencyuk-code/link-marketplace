'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Mail, MessageCircle, Send, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supportChat } from '@/lib/config/support';
import { brand } from '@/lib/config/brand';
import { cn } from '@/lib/utils/cn';

/**
 * Always-available support launcher.
 *
 * With a hosted provider configured this only loads that provider's script and
 * lets their launcher take over. Otherwise it renders a small panel that hands
 * the message to email, so the control is never a dead end.
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

  return <BuiltInChat />;
}

function BuiltInChat() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const pathname = usePathname();
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    messageRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function send(event: React.FormEvent) {
    event.preventDefault();
    // Hand off to email until a hosted chat provider is connected.
    const subject = encodeURIComponent(`Question from ${brand.domain}`);
    const body = encodeURIComponent(
      `${message}\n\n---\nPage: ${pathname}\nReply to: ${email || 'not supplied'}`,
    );
    window.location.href = `mailto:${supportChat.email}?subject=${subject}&body=${body}`;
    setOpen(false);
    setMessage('');
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6 print:hidden">
      {open ? (
        <div
          role="dialog"
          aria-label="Chat with support"
          className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-pop)]"
        >
          <div className="flex items-start justify-between gap-3 bg-navy-900 px-4 py-3.5 text-white">
            <div>
              <p className="text-[14px] font-semibold">Chat to us</p>
              <p className="mt-0.5 text-[12px] text-white/70">{supportChat.responseTime}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={send} className="space-y-3 px-4 py-4">
            <div>
              <Label htmlFor="chat-message">How can we help?</Label>
              <Textarea
                id="chat-message"
                ref={messageRef}
                required
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Ask about a website, pricing or an order..."
                className="mt-1.5 min-h-24"
              />
            </div>
            <div>
              <Label htmlFor="chat-email">Your email</Label>
              <Input
                id="chat-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className="mt-1.5"
              />
            </div>
            <Button type="submit" variant="accent" className="w-full">
              <Send className="h-3.5 w-3.5" />
              Send message
            </Button>
          </form>

          <div className="border-t border-line bg-surface px-4 py-3">
            <p className="text-[12px] text-muted">{supportChat.hours}</p>
            <a
              href={`mailto:${supportChat.email}`}
              className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent-700 hover:underline"
            >
              <Mail className="h-3 w-3" aria-hidden="true" />
              {supportChat.email}
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? 'Close chat' : 'Chat to us'}
        className={cn(
          'flex h-12 items-center gap-2 rounded-full bg-navy-900 pr-5 pl-4 text-white shadow-[var(--shadow-pop)] transition-transform hover:scale-[1.03] active:scale-100',
          open && 'h-11 w-11 justify-center px-0',
        )}
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <>
            <MessageCircle className="h-5 w-5 text-accent-400" aria-hidden="true" />
            <span className="text-[14px] font-medium">Chat to us</span>
          </>
        )}
      </button>
    </div>
  );
}
