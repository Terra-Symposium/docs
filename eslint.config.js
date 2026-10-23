import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.astro/**',
      'dist/**',
      'lib-dist/**',
      'site-dist/**',
      'demo-dist/**',
      'node_modules/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
);
