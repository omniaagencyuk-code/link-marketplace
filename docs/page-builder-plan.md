# Page builder: audit, architecture and plan

A point-in-time plan, not a living rulebook. Once each phase lands, the code is
the truth — this file records why the shape was chosen, not what the shape
currently is.

---

## 1. What already exists

The short version: **most of the hard parts are already built.** The system
this brief describes is roughly 70% present. What is missing is one specific
thing, and it is the thing that makes it a page builder.

### The CMS

- `src/lib/cms/fields.ts` — a typed field vocabulary: `text`, `textarea`,
  `richtext`, `link`, `image`, `list`, `section`. Declarative, no styling.
- `src/lib/cms/registry.ts` — thirteen pages registered in code (home,
  link-building, guest-posts, niche-edits, digital-pr, agencies, gambling,
  content-writing, pricing, how-it-works, terms, privacy, cookies).
- `src/lib/cms/resolve.ts` — `ContentAccessors`: `content.text(section, key)`,
  `.image()`, `.link()`, `.list()`. Saved values merged over code defaults.
- `src/lib/cms/custom-page.ts` — admin-created pages, reusing
  `serviceSections()`, with a reserved-slug list.

### Storage

| Table | Holds |
|---|---|
| `page_content` | `slug` → `values jsonb`, for the thirteen registered pages |
| `custom_pages` | `slug`, `label`, `published`, `values jsonb` |
| `posts` | blog, now with `body_doc` and `sections` (migration 0035) |

Both CMS tables already carry the right RLS: public reads published rows,
admins manage. **No weakening needed.**

### The editor

- `page-editor.tsx` — tabbed section editor.
- `field-input.tsx` — renders a control per field type.
- `media-picker.tsx` — media library over Supabase storage, with upload.
- `rich-text-editor.tsx` — TipTap. Short toolbar, every button mapping to a
  node the renderer knows. **No font, size, colour, margin or CSS control
  anywhere.** Headings H2–H4 on pages, H2–H6 on the blog.
- `rich-text.ts` — a whitelist that rebuilds the document on save. Unknown
  nodes, marks and attributes are dropped rather than stored.
- `rich-text-render.tsx` — the renderer owns every pixel of styling.

This is already the architecture section 46 asks for: **the frontend controls
design, the CMS controls content.** Section 14's paste-cleaning requirement is
satisfied by the whitelist — pasting from Word or ChatGPT cannot carry a font,
a colour or an inline style through it, because those are not node types.

### The frontend

- Homepage: twelve components in `src/components/home/` — `Hero`, `TrustedBy`,
  `NicheGrid`, `HowItWorks`, `MarketplaceSection`, `WhyPressParrot`,
  `PlatformFeatures`, `ServicesGrid`, `AgenciesSection`, `SeoEditorial`,
  `Faq`, `FinalCta`.
- `ServicePage` — one template behind `/link-building`, `/guest-posts`,
  `/niche-edits`, `/digital-pr`, `/link-building-agencies` and every
  admin-created page.
- `NicheLandingPage` — the gambling page. Hero banner, mascot, locked
  marketplace preview, coverage pills, benefit cards.

**The homepage already has the structure the mockup and section 41 describe.**
Hero, trust bar, niche grid, how-it-works, marketplace preview, editorial, FAQ,
final CTA — all present, all CMS-editable. The work there is visual
refinement and extending the editorial area, not a rebuild.

### Marketplace protection

`src/proxy.ts` gates `/marketplace/:path*`, `/websites/:path*`,
`/dashboard/:path*`. `/marketplace` itself is public as the gateway; the
inventory behind it is not. Public pages use
`websiteService.getPublicPreview()`, which redacts **in the service layer** —
so no publisher is identifiable from the HTML, the RSC payload or the
structured data. `countByNiche()` gives real aggregate counts.

**Nothing in this brief requires touching any of that**, and nothing should.

---

## 2. The gap

One sentence: **`definition.sections` is fixed in code, per page.**

`page-editor.tsx` iterates the sections its page definition declares, in the
order the code declares them. There is no adding, reordering, duplicating,
hiding or deleting, because a page's shape is a TypeScript literal.

Everything else in this brief — the section library, variants, animations,
duplication, templates, global sections, locking — hangs off fixing that one
thing.

---

## 3. Proposed data model

Two tables. Additive; nothing existing is altered or rewritten.

```
page_sections
  id           uuid primary key
  page_slug    text not null        -- 'home', 'gambling-link-building', any custom slug
  component    text not null        -- registry key: 'rich-text', 'feature-cards'
  variant      text not null        -- registry-validated, e.g. 'text-left'
  position     int  not null
  hidden       boolean not null default false
  locked       boolean not null default false
  animation    jsonb not null default '{}'   -- {entrance, speed, delay}
  values       jsonb not null default '{}'   -- the section's own fields
  global_id    uuid references global_sections(id)  -- null = local to this page
  unique (page_slug, position)  deferrable

global_sections
  id, name, component, variant, values, animation, updated_at, updated_by
```

Why this shape:

- **One query per page.** `where page_slug = $1 order by position` returns
  every section. Section 30's "do not perform a separate database request for
  every section" is structural, not a discipline to remember.
- **`values` as jsonb** because the shape is per-component and editorial. It
  goes through the component's own field whitelist on save, exactly as rich
  text does — an admin screen is not a reason to trust input (section 35).
- **`global_id` rather than a join table.** A section is either local or a
  reference. "Detach from global" copies the values down and nulls the id.
  Section 19 asks for this not to be complicated.
- **`locked` and `hidden` as columns, not in `values`** — they are queried and
  enforced server-side, so they are not editorial data.

`page_content` and `custom_pages` stay exactly as they are. They keep serving
the pages that have no `page_sections` rows.

---

## 4. Component registry

Split in two, and the split is the whole performance story:

```
src/lib/cms/components/schema.ts     -- key, label, group, variants, fields, defaults
src/lib/cms/components/render.tsx    -- key -> React component (server only)
```

The admin imports **schema** — field definitions, variant lists, labels. It
never imports a frontend component.
The public renderer imports **render** — it never imports a field definition,
an editor, TipTap, or any drag-and-drop code.

That is how section 30's "public pages must not load admin page-builder
JavaScript" is enforced by the module graph rather than by care.

Registering a new component later (section 39) is: add an entry to `schema.ts`,
add a component to `render.tsx`. No CMS changes.

Starting set, grouped as section 12 asks — Content (Rich Text, Text + Image,
Two Column, Image, Table), Marketplace (Preview, Search, Stats, Niche
Categories), Visual (Feature Cards, Stats, Checklist, Comparison, Icon Grid,
Trust Bar, Steps), Parrot (Says, Checklist, View, CTA, Flight Path),
Conversion (CTA, Signup, Marketplace, Order Content), SEO (FAQ, Expandable,
Related Pages).

---

## 5. Rendering

```tsx
// Server component. One query, no client JS of its own.
<PageSections slug="home" fallback={<LegacyHomepage />} />
```

- One query, cached per published page.
- Hidden rows filtered in SQL.
- Unknown `component` keys skipped rather than thrown — a registry entry
  removed in code must not 500 a live page.
- **If a page has no rows, the fallback renders.** That is section 36's
  migration safety net: every page keeps its current hardcoded render until
  its rows exist and have been checked.

---

## 6. Dynamic data stays out of the CMS

A token map, resolved server-side against an allow-list:

```
{{marketplace_site_count}}  {{gambling_site_count}}  {{niche_count}}  {{country_count}}
```

Tokens resolve to values the service layer already exposes publicly. There is
no query string, no table name and no expression in CMS content — an unknown
token renders as nothing rather than as itself.

The gambling site count stays database-driven, per section 21.

---

## 7. Animation

No library. Roughly thirty lines:

- A `<Reveal>` client component: one `IntersectionObserver`, adds a class,
  disconnects. Children are server-rendered inside it, so nothing is
  client-rendered that was not already.
- CSS transitions on `transform` and `opacity` only — never a
  layout-triggering property.
- `@media (prefers-reduced-motion: reduce)` sets every final state
  immediately, in CSS. **Content is visible if JavaScript never runs**, which
  section 32 requires and which an opacity-0 default would break.
- The admin picks from fixed enums (entrance, speed, delay). No easing, no
  duration, no pixel values.

---

## 8. Risks

1. **Scope.** This is ten phases and a large amount of surface. It will take
   several sessions. Phases land independently and each is shippable.
2. **The hero is the LCP element.** Animating it is the single easiest way to
   lose the Core Web Vitals target. The hero's entrance must not delay its
   paint; it animates from a painted state, not into one.
3. **Section values need the rich-text discipline.** A `values` blob is
   attacker-controlled the moment an admin account is. Each component
   validates its own fields server-side on save.
4. **Page duplication and SEO.** Section 17 is explicit: copying canonical
   URLs or metadata silently is the failure. Duplication must clear them and
   prompt.
5. **Lighthouse 90+ mobile.** I have no baseline measurement yet — I cannot
   reach the live site from this environment. Phase 9 measures before it
   claims.
6. **`/buy-backlinks` does not exist.** It is in the brief's page list but is
   neither a route nor a registered page. It needs creating.

---

## 9. Phases

| # | Phase | Ships |
|---|---|---|
| 1 | Data model | Migration, types, repository, one-query read |
| 2 | Registry + renderer | `schema.ts`, `render.tsx`, `<PageSections>` with fallback |
| 3 | Animation | `<Reveal>`, CSS, the enum fields |
| 4 | Admin section editor | List, add, reorder, duplicate, hide, delete, lock |
| 5 | Component library | The ~25 components, with variants |
| 6 | Homepage | Redesign to the mockup, extend the editorial area |
| 7 | Gambling migration | Rows populated, visual diff against current, fallback removed only after |
| 8 | Remaining pages | Buy Backlinks (new), Guest Posts, the rest |
| 9 | Templates, duplication, globals | Section 17, 18, 19 |
| 10 | SEO, performance, accessibility, regression | Measure, then fix |

Order matters: 1–3 are invisible to the public site, so nothing can regress
while they land. The first user-visible change is phase 6.
