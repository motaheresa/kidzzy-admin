// Runs after `vite build` (see the "build" script), so CI fails when the production build breaks
// one of the design-system or PWA rules (docs/design-system.md).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = join(import.meta.dirname, '..', 'dist');
const problems = [];

function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}
const files = filesIn(DIST);
const textFiles = files.filter((f) => /\.(html|js|css|webmanifest|json)$/.test(f));

// ── Fonts: self-hosted, Arabic and Latin only ──────────────────────────────────────────────
const EXPECTED_FONTS = [
  'cairo-arabic-wght-normal',
  'cairo-latin-wght-normal',
  'baloo-bhaijaan-2-arabic-wght-normal',
  'baloo-bhaijaan-2-latin-wght-normal',
];
const fonts = files
  .filter((f) => /\.(woff2?|ttf|otf)$/.test(f))
  .map((f) => relative(DIST, f).replace(/\\/g, '/'));
const fontNames = fonts.map((f) =>
  f
    .split('/')
    .pop()
    .replace(/-[\w-]{8}\.woff2$/, ''),
);
for (const expected of EXPECTED_FONTS) {
  if (!fontNames.includes(expected)) problems.push(`missing font file: ${expected}`);
}
for (const [i, name] of fontNames.entries()) {
  if (!EXPECTED_FONTS.includes(name)) problems.push(`unexpected font file: ${fonts[i]}`);
}
for (const file of textFiles) {
  const text = readFileSync(file, 'utf8');
  if (/fonts\.(googleapis|gstatic)\.com/.test(text)) {
    problems.push(`third-party font request in ${relative(DIST, file)}`);
  }
}

// ── Service worker: installable, but caches nothing (no offline support) ───────────────────
const swPath = join(DIST, 'sw.js');
let sw = '';
try {
  sw = readFileSync(swPath, 'utf8');
} catch {
  problems.push('dist/sw.js is missing');
}
if (sw) {
  const forbidden = [
    ['__WB_MANIFEST', 'a precache manifest injection point'],
    ['precache', 'precaching'],
    ['workbox', 'Workbox'],
    ['registerRoute', 'runtime caching routes'],
    ['NavigationRoute', 'a navigation fallback'],
    ['cache.put', 'writing to a cache'],
    ['cache.add', 'writing to a cache'],
    ['"fetch"', 'a fetch handler'],
    ["'fetch'", 'a fetch handler'],
  ];
  for (const [text, what] of forbidden) {
    if (sw.includes(text)) problems.push(`dist/sw.js contains ${what} (${text})`);
  }
  // An injected precache list looks like [{url:"...",revision:...}]
  if (/revision\s*:/.test(sw) || /url\s*:\s*["'][^"']+\.(html|js|css)["']/.test(sw)) {
    problems.push('dist/sw.js contains a list of files to precache');
  }
  if (!sw.includes('caches.delete') || !sw.includes('clients.claim')) {
    problems.push('dist/sw.js must delete old caches and claim clients on activate');
  }
}
const workboxFiles = files.filter((f) => /workbox-[\w-]+\.js$/.test(f));
for (const f of workboxFiles) problems.push(`unexpected Workbox runtime: ${relative(DIST, f)}`);

// ── The design-system preview page is development only ─────────────────────────────────────
for (const file of textFiles) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('/dev/design-system') || text.includes('DesignSystemPage')) {
    problems.push(
      `the dev-only design-system page is in the production build: ${relative(DIST, file)}`,
    );
  }
}
for (const f of files.filter((f) => /DesignSystemPage/i.test(f))) {
  problems.push(`unexpected dev chunk: ${relative(DIST, f)}`);
}

if (problems.length > 0) {
  console.error(`check-build failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `check-build: ok (${fonts.length} self-hosted font files; sw.js ${sw.length} bytes, no precache manifest)`,
);
