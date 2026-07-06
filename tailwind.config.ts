import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: { glow: '0 20px 60px rgba(251, 146, 60, 0.25)' },
      keyframes: {
        'hurry-pulse': {
          '0%, 100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(22, 163, 74, 0.45)' },
          '50%': { transform: 'scale(1.025)', boxShadow: '0 0 0 8px rgba(22, 163, 74, 0)' },
        },
      },
      animation: {
        'hurry-pulse': 'hurry-pulse 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
export default config;
