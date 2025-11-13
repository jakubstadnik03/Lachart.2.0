/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Hind Vadodara', 'sans-serif'], // Default font
      },
      colors: {
        'custom-gray': '#FCFCFC',
        primary: {
          DEFAULT: '#767EB5',
          dark: '#5E6590',
        },
        secondary: {
          DEFAULT: '#599FD0',
          dark: '#4780A8',
        },
        tertiary: '#7BC2EB',
        white: '#F9FBFD',
        text: '#1D2C4C',
        lighterText: '#4A5E82',
        greenos: '#4BA87D',
        red: {
          DEFAULT: '#E05347',
          dark: '#B84238',
        },
        zinc: {
          150: '#e5e5e5', // Custom shade
        },
      },
    },
  },
  plugins: [],
  safelist: [
    'html',
    'body',
  ],
};
