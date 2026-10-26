import preset from '@terra-symposium/styling/tailwind-preset';

export default {
  presets: [preset],
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  corePlugins: { preflight: false },
};
