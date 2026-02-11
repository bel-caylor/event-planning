/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  important: '.bc-events-app',
  theme: {
    extend: {},
  },
  plugins: [],
}
