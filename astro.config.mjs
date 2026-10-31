import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { DOCS_VITE_OPTIMIZE_DEPS } from './lib-dist/lib/astro.js';

export default defineConfig({
  outDir: './site-dist/',
  devToolbar: { enabled: false },
  integrations: [react()],
  vite: {
    // Linked local packages (notably the live Styling checkout) must resolve
    // React through this app. Otherwise Radix's portal providers load a second
    // React instance and fail during Astro SSR/hydration with invalid hooks.
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { include: [...DOCS_VITE_OPTIMIZE_DEPS] },
  },
});
