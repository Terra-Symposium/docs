/* global module */

// Match the Terra website's original CSS transform order. CSS imports expand
// first, then Tailwind-compatible nesting is flattened before Tailwind resolves
// @apply and utilities.
module.exports = {
  plugins: {
    'postcss-import': {},
    'tailwindcss/nesting': {},
    tailwindcss: {},
  },
};
