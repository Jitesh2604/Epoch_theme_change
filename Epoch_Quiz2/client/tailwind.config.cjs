/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:       'var(--bg)',
        surface1: 'var(--surface-1)',
        surface2: 'var(--surface-2)',
        surface3: 'var(--surface-3)',
        fg1:  'var(--fg-1)',
        fg2:  'var(--fg-2)',
        fg3:  'var(--fg-3)',
        fg4:  'var(--fg-4)',
        line:  'var(--border-1)',
        line2: 'var(--border-2)',
        brand: {
          DEFAULT: 'var(--brand)',
          soft:    'var(--brand-soft)',
          ink:     'var(--brand-ink)',
        },
        warm: 'var(--warm)',
        danger: 'var(--danger)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body:    'var(--font-body)',
        mono:    'var(--font-mono)',
      },
      borderRadius: {
        xl2: 'var(--radius-2xl)',
      },
      boxShadow: {
        elev1: 'var(--shadow-elev-1)',
        elev2: 'var(--shadow-elev-2)',
      },
      keyframes: {
        'fade-in':        { '0%':   { opacity: 0, transform: 'translateY(6px)' },  '100%': { opacity: 1, transform: 'none' } },
        'slide-in-right': { '0%':   { opacity: 0, transform: 'translateX(8px)' },  '100%': { opacity: 1, transform: 'none' } },
        'pulse-soft':     { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
      },
      animation: {
        'fade-in':        'fade-in .35s ease-out',
        'slide-in-right': 'slide-in-right .3s ease-out',
        'pulse-soft':     'pulse-soft 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
