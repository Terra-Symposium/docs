import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  outDir: './site-dist/',
  integrations: [
    starlight({
      title: 'Terra Docs',
      description: 'Install and configure independent Terra Docs instances.',
      sidebar: [
        { label: 'Start here', items: ['index', 'getting-started'] },
        { label: 'Configure', items: ['configuration', 'storage', 'deploy'] },
        { label: 'Reference', items: ['component', 'development'] },
      ],
    }),
  ],
});
