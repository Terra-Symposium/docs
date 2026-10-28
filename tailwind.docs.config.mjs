import preset from '@terra-symposium/styling/tailwind-preset';

export default {
  presets: [preset],
  // The Docs bundle is compiled from the package's source, so every utility
  // used by the extracted workspace and its standalone site is present in the
  // same deterministic stylesheet as Styling's original UI primitives.
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
    './docs/src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
    './node_modules/@terra-symposium/styling/dist/**/*.{js,jsx,ts,tsx,d.ts}',
  ],
  corePlugins: { preflight: false },
};
