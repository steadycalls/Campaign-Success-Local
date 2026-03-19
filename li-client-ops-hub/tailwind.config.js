/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'sla-ok': '#22c55e',
        'sla-warning': '#f59e0b',
        'sla-violation': '#ef4444',
      },
    },
  },
  plugins: [],
};
