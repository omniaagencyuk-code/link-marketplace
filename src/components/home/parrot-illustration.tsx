import { cn } from '@/lib/utils/cn';

/**
 * Placeholder mascot.
 *
 * A flat brand silhouette in the same language as the logo mark: navy body,
 * green crest, coral beak. Deliberately stylised rather than illustrative, so
 * the hero looks intentional while waiting for the real artwork. Drop a file
 * at /public/images/press-parrot-hero.webp and `ParrotHero` uses that instead.
 */
export function ParrotIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 480"
      className={cn('h-auto w-full', className)}
      role="img"
      aria-label="Press Parrot mascot: a macaw wearing sunglasses, perched on a branch"
    >
      {/* branch */}
      <path
        d="M26 418c92 20 228 27 372 13 12-1 15 21 3 23-152 15-286 6-380-16-12-3-7-22 5-20Z"
        fill="#C9B7A4"
      />
      <path d="M330 410c22-16 46-18 64-3-19 17-42 20-64 3Z" fill="var(--color-accent-500)" opacity=".55" />
      <path d="M74 414c-19-14-40-14-54-1 18 15 37 16 54 1Z" fill="var(--color-accent-500)" opacity=".4" />

      {/* crest, behind the head */}
      <g fill="var(--color-accent-400)">
        <path d="M236 66c2-26 20-46 46-52-4 26-20 44-46 52Z" />
        <path d="M262 60c12-20 30-30 50-30-8 22-26 34-50 30Z" opacity=".75" />
      </g>

      {/* one solid silhouette: tail, body, head, legs */}
      <g fill="var(--color-navy-900)">
        <path d="M296 316c34 38 58 86 70 144-38-20-72-56-96-104Z" />
        <path d="M242 166c50 0 80 44 80 106 0 66-34 114-84 114-46 0-76-46-76-112 0-60 30-108 80-108Z" />
        <circle cx="244" cy="134" r="70" />
        <path d="M196 372h14v46h-14zM254 372h14v46h-14z" />
        <path
            d="M180 420c-9 4-15 11-17 20M204 422c-1 8-1 16 1 23M250 422c-1 8-1 16 1 23M274 420c9 4 15 11 17 20"
            stroke="var(--color-navy-900)"
            strokeWidth="11"
            strokeLinecap="round"
            fill="none"
        />
      </g>

      {/* wing, a shade lighter so the body still reads as one shape */}
      <path
        d="M258 194c40 16 60 58 56 112-3 40-19 68-44 82 10-66 4-130-12-194Z"
        fill="#17324A"
      />
      <path
        d="M274 232c14 18 21 44 21 74M288 252c9 16 13 36 12 56"
        stroke="var(--color-accent-400)"
        strokeOpacity=".35"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* hooked beak, matching the logo mark */}
      <path
        d="M180 108 104 142c-13 6-13 23 0 29l55 25c9 4 19-4 16-14l-8-27c-1-4 0-8 2-12l12-22c4-8-5-17-13-13Z"
        fill="var(--color-coral-500)"
      />
      <path d="M112 158c17 13 38 20 60 21-13 10-44 6-60-21Z" fill="var(--color-coral-600)" />

      {/* sunglasses */}
      <g>
        <rect x="176" y="98" width="62" height="40" rx="14" fill="#F8FAFC" />
        <rect x="246" y="98" width="56" height="40" rx="14" fill="#F8FAFC" />
        <path d="M238 112h10" stroke="#F8FAFC" strokeWidth="9" strokeLinecap="round" />
        <rect x="182" y="104" width="50" height="28" rx="11" fill="var(--color-accent-500)" />
        <rect x="252" y="104" width="44" height="28" rx="11" fill="var(--color-accent-500)" />
        <path d="M188 128l24-19M198 130l24-19" stroke="#FFFFFF" strokeWidth="3.5" opacity=".5" />
        <path d="M258 128l24-19M268 130l24-19" stroke="#FFFFFF" strokeWidth="3.5" opacity=".5" />
      </g>
    </svg>
  );
}
