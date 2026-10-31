/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        lhpt: {
          primary: '#00E5FF',
          secondary: '#7C3AED',
          accent: '#A855F7',
          dark: '#080B20',
          surface: '#121A3A',
          text: '#E8F0FF',
          muted: '#8DA4C5'
        }
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', 'sans-serif'],
        script: ['Caveat', 'cursive']
      }
    }
  },
  plugins: []
};
