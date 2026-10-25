import preset from '@terra-symposium/styling/tailwind-preset';

export default {
  presets: [preset],
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}',
    './node_modules/@terra-symposium/styling/dist/**/*.{js,mjs}',
  ],
  corePlugins: { preflight: false },
};
