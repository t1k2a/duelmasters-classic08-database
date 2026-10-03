/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./scripts/build-card-pages.ts', './src/growth/**/*.ts', './public/**/*.html'],
  safelist: ['grid-cols-3'],
  theme: {
    extend: {},
  },
  plugins: [],
};
