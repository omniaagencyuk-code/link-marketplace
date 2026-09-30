'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';
import {
  ACCENT_DEFS,
  ARTWORK_POSITIONS,
  ARTWORK_SIZES,
  BACKGROUND_DEFS,
  DECORATION_DEFS,
  PRESETS,
  accentsFor,
  matchingPreset,
  textTonesFor,
  type Background,
  type SectionStyle,
} from '@/lib/cms/style';
import type { ComponentStyling } from '@/lib/cms/components/schema';

/**
 * Choosing how a section looks.
 *
 * Swatches rather than a list of names, because "soft cream" and "soft grey"
 * are the same word to somebody scanning a dropdown and obviously different
 * as two circles.
 *
 * ## What is not here
 *
 * A hex field. A colour picker. An opacity slider. A class name. The whole
 * control surface is a fixed set of circles and four dropdowns, and that is
 * the point of it: an editor can make a page look varied and cannot make it
 * look like a different website.
 *
 * ## The text and accent lists shrink
 *
 * They are computed from the chosen background by measuring contrast. Yellow
 * is simply absent over cream; it does not appear greyed out with a warning,
 * because a control that can be set to something unreadable eventually is.
 * The same check runs again on the server, so a posted value cannot get past
 * it either.
 */
export function StyleControls({
  sectionId,
  style,
  styling,
}: {
  sectionId: string;
  style: SectionStyle;
  styling: Required<ComponentStyling>;
}) {
  const [background, setBackground] = useState<Background>(style.background);
  const [text, setText] = useState(style.text);

  if (styling.backgrounds === 'none' && !styling.accent && !styling.artwork) {
    return <input type="hidden" name="background" value="default" />;
  }

  const backgrounds = BACKGROUND_DEFS.filter((entry) =>
    styling.backgrounds === 'full' ? true : !entry.strong,
  );
  const tones = textTonesFor(background);
  const accents = accentsFor(background);
  const preset = matchingPreset({ ...style, background, text });

  function choosePreset(key: string) {
    const found = PRESETS.find((entry) => entry.key === key);
    if (!found) return;
    setBackground(found.background);
    setText(found.text);
  }

  // A chosen text colour that the new background cannot carry falls back to
  // automatic rather than staying selected and unreadable.
  const safeText = tones.some((tone) => tone.key === text) ? text : 'auto';
  const safeAccent = accents.some((entry) => entry.key === style.accent) ? style.accent : 'none';

  return (
    <fieldset className="rounded-md border border-line p-3">
      <legend className="px-1 text-[12px] font-medium text-ink-soft">Style</legend>

      {styling.backgrounds !== 'none' ? (
        <>
          <div>
            <Label htmlFor={`preset-${sectionId}`}>Preset</Label>
            <Select
              id={`preset-${sectionId}`}
              value={preset}
              onChange={(event) => choosePreset(event.target.value)}
              className="mt-1.5"
            >
              <option value="">Custom</option>
              {PRESETS.filter(
                (entry) =>
                  styling.backgrounds === 'full' ||
                  !BACKGROUND_DEFS.find((bg) => bg.key === entry.background)?.strong,
              ).map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-[12px] text-muted">
              A preset is the two settings below at once. Change either and it says Custom.
            </p>
          </div>

          <div className="mt-4">
            <span className="text-[13px] font-medium text-ink-soft">Background</span>
            <input type="hidden" name="background" value={background} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {backgrounds.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setBackground(entry.key)}
                  aria-pressed={background === entry.key}
                  title={entry.label}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-[12px] transition-colors',
                    background === entry.key
                      ? 'border-accent-500 bg-accent-50 text-accent-800'
                      : 'border-line text-ink-soft hover:border-line-strong',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 rounded-full border border-line-strong"
                    style={{
                      background:
                        entry.key === 'default'
                          ? 'repeating-linear-gradient(45deg,#fff,#fff 3px,#e4e9ef 3px,#e4e9ef 6px)'
                          : entry.hex,
                    }}
                  />
                  {entry.label}
                  {background === entry.key ? (
                    <Check className="h-3 w-3" aria-hidden="true" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`text-${sectionId}`}>Text colour</Label>
              <Select
                id={`text-${sectionId}`}
                name="text"
                value={safeText}
                onChange={(event) => setText(event.target.value as typeof text)}
                className="mt-1.5"
              >
                {tones.map((tone) => (
                  <option key={tone.key} value={tone.key}>
                    {tone.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-[12px] text-muted">
                Automatic follows the background. Only colours that stay readable over it are
                listed.
              </p>
            </div>

            {styling.decoration ? (
              <div>
                <Label htmlFor={`decoration-${sectionId}`}>Background decoration</Label>
                <Select
                  id={`decoration-${sectionId}`}
                  name="decoration"
                  defaultValue={style.decoration}
                  className="mt-1.5"
                >
                  {DECORATION_DEFS.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.label}
                      {entry.help ? ` - ${entry.help}` : ''}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <input type="hidden" name="decoration" value="none" />
            )}
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="background" value="default" />
          <input type="hidden" name="text" value="auto" />
          <input type="hidden" name="decoration" value="none" />
        </>
      )}

      {styling.accent ? (
        <div className="mt-4">
          <span className="text-[13px] font-medium text-ink-soft">Heading accent</span>
          {/* The swatches carry the field. Two inputs of one name would send
              two values and the second would win, whichever it was. */}
          <AccentSwatches sectionId={sectionId} allowed={accents} chosen={safeAccent} />
          <p className="mt-1.5 text-[12px] text-muted">
            Recolours the highlighted word and the section&rsquo;s marks, not the whole heading.
          </p>
        </div>
      ) : (
        <input type="hidden" name="accent" value="none" />
      )}

      {styling.artwork ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`artwork-position-${sectionId}`}>Artwork position</Label>
            <Select
              id={`artwork-position-${sectionId}`}
              name="artworkPosition"
              defaultValue={style.artworkPosition}
              className="mt-1.5"
            >
              {ARTWORK_POSITIONS.map((position) => (
                <option key={position} value={position}>
                  {position[0]?.toUpperCase()}
                  {position.slice(1)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`artwork-size-${sectionId}`}>Artwork size</Label>
            <Select
              id={`artwork-size-${sectionId}`}
              name="artworkSize"
              defaultValue={style.artworkSize}
              className="mt-1.5"
            >
              {ARTWORK_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size[0]?.toUpperCase()}
                  {size.slice(1)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : (
        <>
          <input type="hidden" name="artworkPosition" value={style.artworkPosition} />
          <input type="hidden" name="artworkSize" value={style.artworkSize} />
        </>
      )}
    </fieldset>
  );
}

/** The accent, as circles. A radio group without the radios. */
function AccentSwatches({
  sectionId,
  allowed,
  chosen,
}: {
  sectionId: string;
  allowed: typeof ACCENT_DEFS;
  chosen: string;
}) {
  const [value, setValue] = useState(chosen);

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <input type="hidden" name="accent" value={value} />
      {allowed.map((entry) => (
        <button
          key={entry.key}
          type="button"
          onClick={() => setValue(entry.key)}
          aria-pressed={value === entry.key}
          id={`accent-${sectionId}-${entry.key}`}
          className={cn(
            'flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-[12px] transition-colors',
            value === entry.key
              ? 'border-accent-500 bg-accent-50 text-accent-800'
              : 'border-line text-ink-soft hover:border-line-strong',
          )}
        >
          <span
            aria-hidden="true"
            className="h-4 w-4 shrink-0 rounded-full border border-line-strong"
            style={{ background: entry.hex ?? 'transparent' }}
          />
          {entry.label}
        </button>
      ))}
    </div>
  );
}
