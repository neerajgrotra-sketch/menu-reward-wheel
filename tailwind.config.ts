import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: { glow: '0 20px 60px rgba(251, 146, 60, 0.25)' },
    },
  },
  plugins: [],
};
export default config;
