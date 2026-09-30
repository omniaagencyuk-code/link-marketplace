'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { AlertCircle, Check, Trash2, Upload } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import {
  deleteMediaAction,
  listArtworkAction,
  listMediaAction,
  uploadMediaAction,
} from '@/app/admin/(protected)/media/actions';
import {
  ARTWORK_CATEGORIES,
  CATEGORY_LABELS,
  type ArtworkCategory,
  type ArtworkEntry,
} from '@/lib/cms/artwork-library';

/** A catalogue entry with whatever file, if any, is behind it. */
type ArtworkChoice = ArtworkEntry & { src?: string };
import { MEDIA_ACCEPT, MEDIA_MAX_BYTES, type MediaAsset } from '@/lib/media/types';

/**
 * Choosing or uploading a picture.
 *
 * One panel used from two places - the image field on a page, and the image
 * button in the rich text editor - so an editor learns it once. It opens on
 * the library rather than on an upload form, because the commonest thing an
 * editor wants is a picture they already have.
 *
 * Dimensions are read here, from the file, before it is sent. The server
 * would need an image decoder to learn the same thing, and the browser
 * already knows it.
 */
export function MediaPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: { url: string; alt: string }) => void;
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [artwork, setArtwork] = useState<ArtworkChoice[]>([]);
  /*
    Artwork first, uploads second. The commonest thing an editor wants is one
    of the twenty-two drawings somebody commissioned for the brand, and making
    them hunt for it among their own screenshots is how a page ends up with a
    screenshot on it.
  */
  const [tab, setTab] = useState<'artwork' | 'library'>('artwork');
  const [category, setCategory] = useState<ArtworkCategory | 'all'>('all');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // Loaded when the panel opens rather than with the page: an editor who
  // never opens it never pays for it. Reopening refreshes in the background
  // and keeps showing the previous list, so a second visit does not flash
  // "Loading" at somebody who has already seen their pictures.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void Promise.all([listMediaAction(), listArtworkAction()]).then(([media, art]) => {
      if (cancelled) return;
      setAssets(media.assets);
      setArtwork(art.artwork);
      setError(media.error ?? art.error ?? null);
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  /** Natural size, read from the file itself before anything is uploaded. */
  function measure(file: File): Promise<{ width?: number; height?: number }> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const image = new window.Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({});
      };
      image.src = url;
    });
  }

  function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > MEDIA_MAX_BYTES) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 5MB.`);
      return;
    }

    startTransition(async () => {
      const size = await measure(file);
      const form = new FormData();
      form.set('file', file);
      // A sensible starting point, editable on the asset once it is up.
      form.set('alt', file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '));
      if (size.width) form.set('width', String(size.width));
      if (size.height) form.set('height', String(size.height));

      const result = await uploadMediaAction(form);
      if (!result.ok || !result.asset) {
        setError(result.error ?? 'Upload failed.');
        return;
      }
      setAssets((current) => [result.asset as MediaAsset, ...current]);
      setSelected(result.asset.id);
      if (fileInput.current) fileInput.current.value = '';
    });
  }

  function remove(asset: MediaAsset) {
    if (!window.confirm(`Delete ${asset.filename}? Pages already using it will show a gap.`)) return;
    startTransition(async () => {
      const result = await deleteMediaAction(asset.id);
      if (!result.ok) {
        setError(result.error ?? 'Could not delete.');
        return;
      }
      setAssets((current) => current.filter((entry) => entry.id !== asset.id));
      setSelected((current) => (current === asset.id ? null : current));
    });
  }

  const chosen = assets.find((asset) => asset.id === selected);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Media"
      description="Upload a picture or choose one already here."
      side="right"
      mobileOnly={false}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            className="flex-1"
            disabled={!chosen}
            onClick={() => {
              if (!chosen) return;
              onSelect({ url: chosen.url, alt: chosen.alt });
              onClose();
            }}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Use this image
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div role="tablist" className="flex gap-1 rounded-lg bg-surface-sunken p-1">
          {(
            [
              ['artwork', 'Press Parrot artwork'],
              ['library', 'Uploaded'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                tab === key ? 'bg-white text-ink shadow-[var(--shadow-card)]' : 'text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'artwork' ? (
          <ArtworkGrid
            artwork={artwork}
            loaded={loaded}
            category={category}
            onCategory={setCategory}
            onChoose={(entry) => {
              if (!entry.src) return;
              onSelect({ url: entry.src, alt: entry.description });
              onClose();
            }}
          />
        ) : null}

        <div className={cn(tab === 'artwork' && 'hidden', 'space-y-4')}>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept={MEDIA_ACCEPT}
            onChange={(event) => upload(event.target.files)}
            className="sr-only"
            id="media-upload"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {pending ? 'Uploading...' : 'Upload an image'}
          </Button>
          <p className="mt-1.5 text-[12px] text-muted">
            PNG, JPEG, WebP, AVIF or GIF, up to 5MB.
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="flex gap-2 rounded-lg border border-negative/30 bg-negative/5 px-3 py-2 text-[13px] leading-snug text-negative"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        {!loaded ? (
          <p className="text-[13px] text-muted">Loading the library...</p>
        ) : assets.length === 0 ? (
          <p className="text-[13px] text-muted">
            Nothing uploaded yet. The first image you upload appears here for every page to use.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {assets.map((asset) => {
              const active = asset.id === selected;
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(asset.id)}
                    className={cn(
                      'group w-full overflow-hidden rounded-lg border text-left transition-colors',
                      active
                        ? 'border-accent-500 ring-2 ring-accent-500/30'
                        : 'border-line hover:border-muted-soft',
                    )}
                  >
                    <span className="flex h-24 items-center justify-center bg-surface-sunken">
                      {/* eslint-disable-next-line @next/next/no-img-element --
                          an admin thumbnail of an arbitrary uploaded URL. */}
                      <img
                        src={asset.url}
                        alt=""
                        className="max-h-24 max-w-full object-contain"
                        loading="lazy"
                      />
                    </span>
                    <span className="block truncate px-2 py-1.5 text-[12px] text-ink-soft">
                      {asset.filename}
                    </span>
                    <span className="block px-2 pb-1.5 text-[11px] text-muted">
                      {asset.width && asset.height ? `${asset.width}x${asset.height} · ` : ''}
                      {Math.max(1, Math.round(asset.sizeBytes / 1024))}KB
                    </span>
                  </button>

                  {active ? (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <AltField asset={asset} onSaved={(alt) => {
                        setAssets((current) =>
                          current.map((entry) => (entry.id === asset.id ? { ...entry, alt } : entry)),
                        );
                      }} />
                      <button
                        type="button"
                        onClick={() => remove(asset)}
                        disabled={pending}
                        aria-label={`Delete ${asset.filename}`}
                        className="shrink-0 rounded p-1.5 text-muted hover:bg-negative/5 hover:text-negative"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}

                  {active ? (
                    <ArtworkSlot
                      asset={asset}
                      artwork={artwork}
                      onFiled={(slug, url) => {
                        setArtwork((current) =>
                          current.map((entry) =>
                            entry.slug === slug
                              ? { ...entry, src: url }
                              : entry.src === url
                                ? { ...entry, src: undefined }
                                : entry,
                          ),
                        );
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Filing an upload into one of the catalogue's slots.
 *
 * This is what makes the library a library rather than a list of hopes: an
 * editor uploads the drawing, picks which slot it fills, and every page
 * pointing at that name gets it. Replacing it later is the same two clicks.
 *
 * Only empty slots and the one this picture already fills are offered, so two
 * uploads cannot both claim one name and leave the page showing whichever the
 * query happened to return first.
 */
function ArtworkSlot({
  asset,
  artwork,
  onFiled,
}: {
  asset: MediaAsset;
  artwork: ArtworkChoice[];
  onFiled: (slug: string | null, url: string) => void;
}) {
  const mine = artwork.find((entry) => entry.src === asset.url);
  const [slug, setSlug] = useState(mine?.slug ?? '');
  const [saving, startSaving] = useTransition();

  const open = artwork.filter((entry) => !entry.src || entry.slug === mine?.slug);

  return (
    <label className="mt-1.5 block">
      <span className="text-[11px] text-muted">Press Parrot artwork</span>
      <select
        value={slug}
        disabled={saving}
        aria-label={`Which artwork ${asset.filename} is`}
        onChange={(event) => {
          const next = event.target.value;
          setSlug(next);
          startSaving(async () => {
            const { setArtworkAction } = await import('@/app/admin/(protected)/media/actions');
            await setArtworkAction(asset.id, next || null);
            onFiled(next || null, asset.url);
          });
        }}
        className="mt-1 h-8 w-full rounded-md border border-line bg-white px-2 text-[12px] text-ink"
      >
        <option value="">Not artwork</option>
        {open.map((entry) => (
          <option key={entry.slug} value={entry.slug}>
            {CATEGORY_LABELS[entry.category]} - {entry.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The brand's own artwork, as pictures.
 *
 * Filtered by what it is for rather than by filename, because an editor
 * looking for the gambling parrot is thinking "gambling", not
 * "niche-igaming.png".
 *
 * An entry with no file is shown rather than hidden. The catalogue is the
 * list of drawings the brand has commissioned, and a gap in it is a thing
 * somebody needs to know about.
 */
function ArtworkGrid({
  artwork,
  loaded,
  category,
  onCategory,
  onChoose,
}: {
  artwork: ArtworkChoice[];
  loaded: boolean;
  category: ArtworkCategory | 'all';
  onCategory: (next: ArtworkCategory | 'all') => void;
  onChoose: (entry: ArtworkChoice) => void;
}) {
  if (!loaded) return <p className="text-[13px] text-muted">Loading the artwork...</p>;

  const shown = artwork.filter((entry) => category === 'all' || entry.category === category);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(['all', ...ARTWORK_CATEGORIES] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onCategory(key)}
            aria-pressed={category === key}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[12px] transition-colors',
              category === key
                ? 'border-accent-500 bg-accent-50 text-accent-800'
                : 'border-line text-ink-soft hover:border-line-strong',
            )}
          >
            {key === 'all' ? 'All' : CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-3">
        {shown.map((entry) => (
          <li key={entry.slug}>
            <button
              type="button"
              disabled={!entry.src}
              onClick={() => onChoose(entry)}
              className={cn(
                'w-full overflow-hidden rounded-lg border text-left transition-colors',
                entry.src
                  ? 'border-line hover:border-accent-500'
                  : 'cursor-not-allowed border-dashed border-line-strong opacity-60',
              )}
            >
              <span className="flex h-24 items-center justify-center bg-surface-sunken">
                {entry.src ? (
                  /* eslint-disable-next-line @next/next/no-img-element --
                     A thumbnail in an admin panel, from either the public
                     folder or the media host. next/image throws on a host
                     that is not in its allow list, and that throw would take
                     the editor's unsaved copy with it. */
                  <img
                    src={entry.src}
                    alt=""
                    className="max-h-24 w-full object-contain p-2"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-[11px] text-muted">Not drawn yet</span>
                )}
              </span>
              <span className="block border-t border-line px-2.5 py-2">
                <span className="block text-[12px] font-medium text-ink">{entry.name}</span>
                <span className="block text-[11px] text-muted">
                  {entry.placement} &middot; {entry.aspect}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Alt text, stored against the file rather than the page.
 *
 * Written once, when the picture is uploaded, and reused everywhere it
 * appears - which is how it ends up written at all.
 */
function AltField({ asset, onSaved }: { asset: MediaAsset; onSaved: (alt: string) => void }) {
  const [value, setValue] = useState(asset.alt);
  const [saving, startTransition] = useTransition();

  return (
    <Input
      value={value}
      placeholder="Describe the image"
      aria-label={`Alt text for ${asset.filename}`}
      disabled={saving}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value === asset.alt) return;
        startTransition(async () => {
          const { updateMediaAltAction } = await import('@/app/admin/(protected)/media/actions');
          await updateMediaAltAction(asset.id, value);
          onSaved(value);
        });
      }}
      className="h-8 text-[12px]"
    />
  );
}
