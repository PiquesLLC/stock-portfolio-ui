/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark mode colors (primary theme)
        'rh-black': '#000000',
        'rh-dark': '#1a1a1a',
        'rh-card': '#1e1e1e',
        'rh-border': '#2f2f2f',
        'rh-green': '#00c805',
        'rh-red': '#ff5000',
        'rh-text': '#ffffff',
        'rh-muted': '#9b9b9b',
        // Light mode colors
        'rh-light-bg': '#f5f5f7',
        'rh-light-card': '#ffffff',
        'rh-light-border': '#e5e5e5',
        'rh-light-text': '#1a1a1a',
        'rh-light-muted': '#6b7280',
      },
    },
  },
  plugins: [],
}
