'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deletePostAction } from '@/app/admin/(protected)/blog/actions';

/**
 * Delete, with a confirmation step.
 *
 * Deleting a published post breaks any link pointing at it, so the second
 * click is deliberate rather than decorative.
 */
export function DeletePostButton({ id, title }: { id: string; title: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() => startTransition(() => void deletePostAction(id))}
        >
          {pending ? 'Deleting...' : 'Delete'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Delete ${title}`}
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
