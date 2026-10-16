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

if (problems.length > 0) {
  console.error(`check-build failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`check-build: ok (${fonts.length} self-hosted font files)`);
