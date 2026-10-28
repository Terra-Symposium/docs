import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { DOCS_VITE_OPTIMIZE_DEPS } from './lib-dist/lib/astro.js';

export default defineConfig({
  outDir: './site-dist/',
  devToolbar: { enabled: false },
  integrations: [react()],
  vite: { optimizeDeps: { include: [...DOCS_VITE_OPTIMIZE_DEPS] } },
});
