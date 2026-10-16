# Design system

The KidzzyCoders admin app borrows the academy's identity (the deep purple and yellow of its posters, the Baloo Bhaijaan 2 display face, the logo) and keeps the screens calm: light surfaces, purple as the primary color, yellow as an accent. Everything lives in `apps/web`; run the app and open **`/dev/design-system`** (development only) to see every token and component state.

## Tokens

Defined once in `src/styles/tokens.css`, in Tailwind 4's `@theme`: each token is a CSS variable (`var(--color-primary)`) and a utility (`bg-primary`, `text-muted-foreground`, `border-input`). Components use the **semantic** tokens; the raw brand scale (`brand-50` … `brand-950`) is for the rare decorative case.

| Role         | Token                                                | Value                     | Use                                        |
| ------------ | ---------------------------------------------------- | ------------------------- | ------------------------------------------ |
| Page         | `background`                                         | #f8f7fc                   | the page behind everything                 |
| Surface      | `surface`, `card`                                    | #ffffff                   | cards, inputs, menus                       |
| Subtle fill  | `muted`                                              | #efecf6                   | skeletons, table heads, hovers             |
| Text         | `foreground` / `muted-foreground`                    | #1d1433 / #5b5470         | body / secondary text                      |
| Primary      | `primary`, `primary-hover`, `primary-foreground`     | #3c1590, #2f0f75, #ffffff | main buttons, links                        |
| Secondary    | `secondary`, `secondary-foreground`                  | #ede7fc, #3c1590          | soft brand fills, badges                   |
| Accent       | `accent`, `accent-foreground`                        | #ffc414, #2a0d5e          | yellow highlights, **never text on light** |
| Brand panel  | `deep`, `deep-foreground`                            | #22094f, #ffffff          | the login panel                            |
| Control edge | `input`                                              | #8a83a0                   | borders that identify a control (3:1)      |
| Focus        | `ring`                                               | #6d3fe6                   | keyboard focus outline (3:1)               |
| Divider      | `border`                                             | #e3dfee                   | decorative lines only                      |
| Semantic     | `success*`, `warning-soft*`, `danger*`, `info-soft*` | see tokens.css            | messages, badges, toasts                   |

**Contrast is tested.** `src/styles/tokens.test.ts` reads every color from `tokens.css` and fails if any pair in `src/lib/design-tokens` drops under WCAG AA: **4.5:1** for text, **3:1** for control edges and focus. Yellow on white is 1.60:1, so yellow is a background (with `accent-foreground` ink text, 9.99:1) or a highlight on the deep panel (10.79:1), never text on a light surface. A new color pair goes into `TEXT_PAIRS` or `UI_PAIRS` first.

Other scales: type `text-xs` to `text-4xl` with Arabic line heights (body 1.7); radius `sm` 6, `md` 10, `lg` 14, `xl` 20 px; shadows `sm`, `md`, `lg` tinted with the deep purple; motion durations `fast` 150, `base` 250, `slow` 400 ms and easings `ease-out`, `ease-in-out`. There is no dark mode yet.

**Numbers** use Western digits. Format them with `src/lib/format` (`formatNumber`, `formatMoney`, `formatDate`, locale `ar-EG-u-nu-latn`; plain `ar-EG` would print ١٢٣), and put `numeric` (tabular figures) on tables and counters.

## Fonts

- **Cairo** (interface, `font-sans`, the default) and **Baloo Bhaijaan 2** (display, `font-display`, for page titles and the login heading), from `@fontsource-variable/*`, self-hosted: no request to Google Fonts or any third party.
- `src/styles/fonts.css` declares only the **Arabic and Latin** files (Fontsource's own CSS would bundle every subset), with `font-display: swap`. `index.html` preloads Cairo's Arabic file.
- `scripts/check-build.mjs` fails the build on a missing, extra or third-party font.

## Components

`src/components/ui`, imported from `@/components/ui`. Use them before writing a raw element.

**Atoms** (`atoms/`, adapted from shadcn/ui radix-nova, lowercase file names as shadcn writes them):

| Component     | When                                                                                                                                                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`      | Every action. `variant`: primary (one per screen), secondary, outline, ghost, danger, accent, link. `size`: md (44 px), lg (48 px), icon (44 px square). `loading` shows a spinner, sets `aria-busy` and blocks clicks. `asChild` styles a link as a button. Defaults to `type="button"`. |
| `Input`       | A bare text input; inside forms use `FormField`.                                                                                                                                                                                                                                          |
| `Label`       | A label for a custom control.                                                                                                                                                                                                                                                             |
| `Alert`       | A message in the page: info and success (`role="status"`), warning and danger (`role="alert"`). With `AlertTitle`, `AlertDescription`.                                                                                                                                                    |
| `Card`        | A group of related content: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.                                                                                                                                                                                    |
| `Badge`       | A short status: neutral, brand, accent, success, warning, danger, info.                                                                                                                                                                                                                   |
| `Spinner`     | Something is loading (announced, `role="status"`).                                                                                                                                                                                                                                        |
| `Skeleton`    | The shape of content that is loading.                                                                                                                                                                                                                                                     |
| `Table`       | A data list: `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`. It scrolls sideways on a narrow screen instead of widening the page. Put `dir="ltr"` and `text-end` on a cell with an email or a phone.                                                                    |
| `ToggleGroup` | A few options where one is on, such as a list filter (`type="single"`, `ToggleGroupItem` 44 px high, arrow keys move between items).                                                                                                                                                      |
| `Textarea`    | Multi-line text, styled like `Input`; it grows with its text.                                                                                                                                                                                                                             |
| `AlertDialog` | A modal question (Radix: focus trap, Escape, focus returns to the trigger). For "are you sure?", use `ConfirmDialog`.                                                                                                                                                                     |

**Molecules** (`molecules/`, ours):

| Component           | When                                                                                                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FormField`         | Every form field: label, optional hint and error; wires `htmlFor`, `aria-invalid`, `aria-describedby`. Errors come from `AppError.fieldErrors`.                                                                                                          |
| `PageHeader`        | The top of every screen: title, description, actions.                                                                                                                                                                                                    |
| `EmptyState`        | A list or screen with nothing yet: icon, title, text, action.                                                                                                                                                                                            |
| `FullScreenMessage` | A screen-filling loading, not-found or error state.                                                                                                                                                                                                      |
| `Toaster`           | Mounted once in `RootLayout`; the error layer's `reportError` shows toasts in it.                                                                                                                                                                        |
| `ConfirmDialog`     | "Are you sure?" before an important change (deactivate, reset). The parent controls `open`, keeps it open while `busy` (Escape and رجوع do nothing then) and closes it when the action settles. `tone="danger"` for an action that takes something away. |
| `SearchInput`       | A list's search box: it calls `onSearch` with the trimmed text once typing pauses (`SEARCH_DEBOUNCE_MS`, 300 ms). Keep the search in the URL with `useListParams` (`src/lib/hooks`).                                                                     |
| `Pagination`        | Previous / next under an offset-paginated list, with "صفحة 2 من 5"; nothing when everything fits on one page.                                                                                                                                            |
| `DetailList`        | A record's fields as label and value pairs; an empty value shows a dash.                                                                                                                                                                                 |

Rules: every interactive element is at least **44 × 44 px**; keyboard focus is always visible (`:focus-visible` outline in the ring color); never remove an outline without replacing it.

**Adding a shadcn component.** `components.json` is set up (radix-nova, `rtl: true`, primitives in `components/ui/atoms`). The registry now imports `cn` from the `cn` npm package; we keep our own in `src/lib/utils.ts`. So preview with `pnpm dlx shadcn@<version> add <name> --dry-run --view`, write the file into `atoms/` with `import { cn } from '@/lib/utils'`, adapt it to the tokens and the 44 px rule, and do not install `cn`.

## Motion

`src/lib/motion` (GSAP with `@gsap/react`):

- Presets: `fadeUp` (entering content) and `stagger` (entering items one after another). Use them inside `useMotion(ref, () => …)`, which reverts everything on unmount; pass elements from refs, not selectors.
- Short and purposeful: 150–400 ms, for content entering and for feedback, never decoration that loops, never blocking input.
- Only **opacity and transform** are animated.
- **Reduced motion:** every preset runs inside `gsap.matchMedia('(prefers-reduced-motion: no-preference)')`, so nothing runs when the user asks for less motion (tested). CSS motion uses `motion-safe:` the same way (spinner, skeleton, press feedback).
- Press feedback is CSS, not GSAP: Button scales to 0.98 on press, timed by `duration-fast` and `ease-out`.
- `MOTION` in `presets.ts` holds the CSS motion tokens in seconds; a test keeps them equal.

## RTL

The app is Arabic and right-to-left (`<html dir="rtl">`).

- Use logical utilities only: `ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`, `text-start`/`text-end`, `rounded-s`/`rounded-e`, `border-s`/`border-e`. ESLint refuses `ml-`, `pr-`, `left-`, `text-right` and the other physical ones.
- Directional icons (arrows, chevrons) get `rtl:rotate-180` when they mean "next" or "back".
- Fields whose value is Latin (email, phone, codes) get `dir="ltr"` and `text-start`.
- Popovers and tooltips rendered in a portal need an explicit `dir="rtl"` (shadcn note).

## Icons and logo

The logo's only source is `apps/web/brand/logo.png` (it is never served). `pnpm --filter @kidzzy/web assets:icons` regenerates `favicon.ico`, `pwa-64/192/512`, `maskable-icon-512x512.png` (on `brand-100`) and `apple-touch-icon-180x180.png` (on white) into `public/`; commit the result. The app shell and the login screen show `pwa-192x192.png` / `pwa-64x64.png`. `theme_color` is `primary`, `background_color` is `background`.

## PWA policy: no offline support

The PWA exists for **installation and web push only**.

- The service worker is our own `src/sw.ts`, built by vite-plugin-pwa with `injectManifest` and no injection point. It caches **nothing**: no precache, no runtime caching, no navigation fallback, no `fetch` handler. Every request goes to the network.
- On activate it deletes every cache (the old generateSW worker had precached the app) and claims the open tabs, so no device keeps serving an old build.
- Web push handlers go in the marked section of `sw.ts` (ADR-0008).
- `scripts/check-build.mjs` fails the build if the built worker gains a precache manifest, Workbox or a fetch handler.
- Deployment: serve `/sw.js` with `Cache-Control: no-cache` so browsers pick up a new worker at once.
