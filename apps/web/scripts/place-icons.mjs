// The icon generator writes its files next to the source image (brand/). Move them to public/,
// where Vite serves them; the source logo stays in brand/ and is never served.
import { readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const generated =
  /^(favicon\.ico|pwa-\d+x\d+\.png|maskable-icon-\d+x\d+\.png|apple-touch-icon-\d+x\d+\.png)$/;

const moved = readdirSync(join(root, 'brand')).filter((name) => generated.test(name));
for (const name of moved) renameSync(join(root, 'brand', name), join(root, 'public', name));
console.log(`place-icons: moved ${moved.length} files to public/: ${moved.join(', ')}`);
