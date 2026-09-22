'use client';

import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { acceptedNiches } from '@/lib/config/accepted-niches';

/**
 * The topics a publisher will take.
 *
 * Regulated topics are separated out because they are the ones that actually
 * get filtered on: a buyer in gambling or CBD is looking for the short list of
 * publishers who will take them, and a publisher who accepts none of them
 * wants that to be unambiguous rather than inferred from silence.
 *
 * Submits one checkbox per niche, all under the same name, which the server
 * action reads with `getAll` and validates against the same list.
 */
export function AcceptedNichesPicker({
  selected,
  onChange,
}: {
  selected: string[];
  /**
   * Told to the form so the price grid can follow the ticks. The selection
   * still lives here; this reports it rather than surrendering it, because
   * nothing outside needs to set it.
   */
  onChange?: (niches: string[]) => void;
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set(selected));

  function toggle(slug: string, on: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(slug);
      else next.delete(slug);
      onChange?.([...next]);
      return next;
    });
  }

  const general = acceptedNiches.filter((niche) => !niche.regulated);
  const regulated = acceptedNiches.filter((niche) => niche.regulated);

  return (
    <div className="space-y-5">
      <Group
        title="Topics"
        niches={general}
        chosen={chosen}
        onToggle={toggle}
      />
      <Group
        title="Regulated topics"
        description="The ones buyers filter for specifically. Only tick what the publisher has confirmed."
        niches={regulated}
        chosen={chosen}
        onToggle={toggle}
      />

      <p className="text-[12px] text-muted">
        {chosen.size === 0
          ? 'Nothing selected. The listing will not say which topics are welcome.'
          : `${chosen.size} selected.`}
      </p>
    </div>
  );
}

function Group({
  title,
  description,
  niches,
  chosen,
  onToggle,
}: {
  title: string;
  description?: string;
  niches: { slug: string; label: string }[];
  chosen: Set<string>;
  onToggle: (slug: string, on: boolean) => void;
}) {
  return (
    <fieldset>
      <legend className="text-[13px] font-semibold text-ink">{title}</legend>
      {description ? <p className="mt-0.5 text-[12px] text-muted">{description}</p> : null}

      <div className="mt-3 grid gap-x-4 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {niches.map((niche) => (
          <label
            key={niche.slug}
            className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-soft"
          >
            <Checkbox
              name="acceptedNiches"
              value={niche.slug}
              checked={chosen.has(niche.slug)}
              onChange={(event) => onToggle(niche.slug, event.target.checked)}
            />
            {niche.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
