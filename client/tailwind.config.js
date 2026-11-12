/** @type {import('tailwindcss').Config} */

// Colours come from CSS variables in app/globals.css (RGB channels), so light
// and dark themes switch in one place. See docs/2026-11-11-ui-redesign.md.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: {
          DEFAULT: token('surface'),
          muted: token('surface-muted'),
          hover: token('surface-hover'),
        },
        line: {
          DEFAULT: token('line'),
          strong: token('line-strong'),
        },
        fg: {
          DEFAULT: token('fg'),
          muted: token('fg-muted'),
          subtle: token('fg-subtle'),
        },
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          soft: token('accent-soft'),
          fg: token('accent-fg'),
        },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft'), hover: token('danger-hover') },
        info: { DEFAULT: token('info'), soft: token('info-soft') },
        neutral: { DEFAULT: token('neutral'), soft: token('neutral-soft') },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"IBM Plex Sans Thai"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      fontSize: {
        // [size, line-height]
        xs: ['0.75rem', { lineHeight: '1rem' }], // 12
        sm: ['0.875rem', { lineHeight: '1.25rem' }], // 14
        base: ['1rem', { lineHeight: '1.5rem' }], // 16
        lg: ['1.125rem', { lineHeight: '1.625rem' }], // 18
        xl: ['1.25rem', { lineHeight: '1.75rem' }], // 20
        '2xl': ['1.5rem', { lineHeight: '2rem' }], // 24
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30
      },
      borderRadius: {
        control: '6px',
        card: '10px',
        dialog: '14px',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(var(--shadow) / 0.06), 0 2px 8px rgb(var(--shadow) / 0.05)',
        raised: '0 4px 12px rgb(var(--shadow) / 0.10), 0 16px 40px rgb(var(--shadow) / 0.12)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'dialog-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'slide-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'dialog-in': 'dialog-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'slide-in-right': 'slide-in-right 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'slide-in-left': 'slide-in-left 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'toast-in': 'toast-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
