import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Icons generated from the academy logo (brand/logo.png, the only source).
// Run `pnpm --filter @kidzzy/web assets:icons`; the files land in public/ and are committed.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // Android may crop a maskable icon to a circle: the logo sits in the safe zone on brand-soft.
    maskable: { sizes: [512], padding: 0.3, resizeOptions: { background: '#ede7fc' } },
    // iOS does not support transparency on the home screen.
    apple: { sizes: [180], padding: 0.3, resizeOptions: { background: '#ffffff' } },
  },
  images: ['brand/logo.png'],
});
