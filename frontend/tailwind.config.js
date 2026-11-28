/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: 'var(--color-surface, #ffffff)',
        'surface-muted': 'var(--color-surface-muted, #f8fafc)',
        line: 'var(--color-line, #e2e8f0)',
        'line-strong': 'var(--color-line-strong, #cbd5e1)',
        ink: 'var(--color-ink, #0f172a)',
        'ink-soft': 'var(--color-ink-soft, #475569)',
        'ink-faint': 'var(--color-ink-faint, #94a3b8)',
        accent: {
          DEFAULT: 'var(--color-accent, #2563eb)',
          strong: 'var(--color-accent-strong, #1d4ed8)',
          ink: 'var(--color-accent-ink, #ffffff)',
        },
      },
      borderRadius: {
        tile: 'var(--radius-tile, 12px)',
        card: 'var(--radius-card, 20px)',
      },
    },
  },
  plugins: [],
}
