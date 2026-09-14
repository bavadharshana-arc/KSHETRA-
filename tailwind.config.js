/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0A0F1D',
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
        },
        gov: {
          blue: '#1D4ED8',
          'blue-dark': '#1E40AF',
          'blue-light': '#3B82F6',
          'blue-subtle': '#EFF6FF',
          accent: '#0284C7',
          gold: '#D97706',
        },
        risk: {
          low: '#10B981',
          'low-bg': '#ECFDF5',
          'low-border': '#A7F3D0',
          med: '#F59E0B',
          'med-bg': '#FFFBEB',
          'med-border': '#FDE68A',
          high: '#EF4444',
          'high-bg': '#FEF2F2',
          'high-border': '#FECACA',
          info: '#3B82F6',
          'info-bg': '#EFF6FF',
          'info-border': '#BFDBFE',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
