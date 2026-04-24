import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#FFF7ED',
        surface: '#FFFFFF',
        brand: {
          DEFAULT: '#F97316',
          hover: '#EA580C',
          active: '#C2410C',
          soft: '#FFEDD5',
        },
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        ink: '#1F2937',
        muted: '#6B7280',
        line: '#E5E7EB',
      },
      boxShadow: {
        card: '0 20px 40px -24px rgba(31, 41, 55, 0.22)',
        glow: '0 18px 36px -26px rgba(249, 115, 22, 0.45)',
      },
    },
  },
  plugins: [],
}

export default config
