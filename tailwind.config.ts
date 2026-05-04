import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#1c1c1e',
        surface: '#2c2c2e',
        'surface-hover': '#3a3a3c',
        border: '#3a3a3c',
        'border-subtle': '#2c2c2e',
        text: '#f2f2f7',
        'text-muted': '#8e8e93',
        'text-dim': '#636366',
        accent: '#c45f28',
        'accent-hover': '#d4722f',
        'accent-dim': '#7a3b18',
        success: '#30d158',
        warning: '#ffd60a',
        danger: '#ff453a',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        window: '12px',
      },
      transitionTimingFunction: {
        'menu': 'cubic-bezier(0.4, 0, 0.2, 1)',
      }
    },
  },
  plugins: [],
}

export default config
