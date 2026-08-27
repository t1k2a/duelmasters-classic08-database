/** @type {import('tailwindcss').Config} */
export default {
  content: ['./scripts/build-card-pages.ts', './public/**/*.html'],
  safelist: ['grid-cols-3'],
  theme: {
    extend: {},
  },
  plugins: [],
};
