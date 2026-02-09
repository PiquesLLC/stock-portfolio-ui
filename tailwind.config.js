/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      keyframes: {
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.90' },
        },
        'fadeIn': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.2s ease-out',
        'fade-in-up': 'fade-in-up 0.5s ease-out both',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
      },
      colors: {
        // Dark mode colors (primary theme)
        'rh-black': '#050505',
        'rh-dark': '#1a1a1a',
        'rh-card': '#1e1e1e',
        'rh-border': '#2f2f2f',
        'rh-green': '#00C805',
        'rh-red': '#E8544E',
        'rh-text': '#F5F5F7',
        'rh-muted': '#9b9b9b',
        // Light mode colors
        'rh-light-bg': '#F7F7F8',
        'rh-light-card': '#ffffff',
        'rh-light-border': '#E2E4E9',
        'rh-light-text': '#111111',
        'rh-light-muted': '#6B7280',
        'rh-light-label': '#9CA3AF',
      },
    },
  },
  plugins: [],
}
