/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'rh-black': '#000000',
        'rh-dark': '#1a1a1a',
        'rh-card': '#1e1e1e',
        'rh-border': '#2f2f2f',
        'rh-green': '#00c805',
        'rh-red': '#ff5000',
        'rh-text': '#ffffff',
        'rh-muted': '#9b9b9b',
      },
    },
  },
  plugins: [],
}
