/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0070f3',
          dark: '#0051af',
          light: '#3291ff',
        },
        slate: {
          950: '#020617',
        }
      },
      backgroundImage: {
        'premium-gradient': 'linear-gradient(135deg, rgba(0, 112, 243, 0.1) 0%, rgba(0, 112, 243, 0.02) 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
