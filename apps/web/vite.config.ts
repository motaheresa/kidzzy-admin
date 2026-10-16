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
        theme_color: '#2f5fd0',
        background_color: '#fafaf8',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
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
