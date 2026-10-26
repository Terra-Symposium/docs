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
  {
    // The imported Terra editor still carries unchecked types and placeholder bindings.
    files: ['src/components/terra/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
