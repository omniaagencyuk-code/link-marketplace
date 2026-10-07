/**
 * Reading what somebody typed into the block box.
 *
 * One field, because asking "address or domain?" is asking the person to
 * classify something they have already written down. An `@` in the middle is
 * an address and anything else is a company, which is how everybody writes
 * both of them anyway.
 *
 * Pure. The database enforces the block; this only works out what was meant
 * and refuses the two things that would be a disaster to store.
 */
import { isFreeProvider, senderDomain } from '@/lib/sourcing/offers';

export type BlockTarget =
  | { kind: 'email'; email: string }
  | { kind: 'domain'; domain: string }
  | { kind: 'refused'; why: string };

/**
 * What to block, from one line of typing.
 *
 * Two things are refused rather than stored, both because the block is
 * applied by a trigger on every reply that arrives and a bad one is therefore
 * very quiet:
 *
 * - **A free provider as a whole domain.** `gmail.com` typed without an
 *   address would silence every publisher who runs their business from a
 *   personal account, which from this queue is a great many of them, and the
 *   only sign would be a sourcing pipeline that quietly stopped finding
 *   anything.
 * - **Anything that is not a domain.** A typo with no dot in it would sit on
 *   the list matching nothing, which is worse than an error: it looks done.
 */
export function readBlockTarget(typed: string): BlockTarget {
  const text = typed.trim().toLowerCase().replace(/^mailto:/, '');
  if (!text) return { kind: 'refused', why: 'Type an email address or a company domain.' };

  if (text.includes('@') && !text.startsWith('@')) {
    const host = senderDomain(text);
    const name = text.slice(0, text.lastIndexOf('@'));
    if (!name || !host || !host.includes('.')) {
      return { kind: 'refused', why: `"${typed.trim()}" is not an email address.` };
    }
    return { kind: 'email', email: `${name}@${host}` };
  }

  const host = text.replace(/^@/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? '';
  if (!host.includes('.') || host.endsWith('.') || host.startsWith('.')) {
    return { kind: 'refused', why: `"${typed.trim()}" is not a domain or an email address.` };
  }
  if (isFreeProvider(host)) {
    return {
      kind: 'refused',
      why: `${host} is a free email provider, so blocking the whole domain would silence every publisher who writes from one. Block the individual address instead.`,
    };
  }

  return { kind: 'domain', domain: host };
}
