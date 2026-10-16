/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'كيدزي كودرز - نظام الادارة',
        short_name: 'كيدزي كودرز',
        description: 'Academy Management System for KidzzyCoders',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        // From the tokens (src/styles/tokens.css): --color-primary and --color-background.
        theme_color: '#3c1590',
        background_color: '#f8f7fc',
        // Generated from brand/logo.png by `pnpm assets:icons` (docs/design-system.md).
        icons: [
          { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  // "@/..." = src/... (same as tsconfig paths; CLAUDE.md has the import rule)
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    // Same-origin /api in development, like production (ADR-005)
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
