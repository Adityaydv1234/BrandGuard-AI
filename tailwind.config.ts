import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F4F6F8',
        sheet: '#FFFFFF',
        ink: '#17222E',
        graphite: '#4A5664',
        rule: '#D9DEE4',
        mark: { high: '#B42A17', med: '#99620C', low: '#2F5F92', ok: '#2B6E47' },
        stamp: '#1E5B47',
      },
      fontFamily: {
        sans: ['"Public Sans Variable"', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4 Variable"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
export default config;
