module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Hind Vadodara', 'sans-serif'], // Setting Hind Vadodara as the default font
      },
      colors: {
        'custom-gray': '#FCFCFC', // Adding new color
        primary: {
          DEFAULT: '#767EB5',
          dark: '#5E6590',
        },
        'secondary': {
          DEFAULT: '#599FD0',
          dark: '#4780A8',
        },
        'tertiary': '#7BC2EB',
        white: '#F9FBFD',
        'text': '#1D2C4C',
        'lighterText': '#4A5E82',
        'green': '#4BA87D',
        red: {
          DEFAULT: '#E05347',
          dark: '#B84238', // Darker version of the red color
        },
        zinc: {
          150: '#e5e5e5', // Slightly darker than bg-zinc-100
        },
      },
    },
  },
  plugins: [],
};
