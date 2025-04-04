module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Hind Vadodara', 'sans-serif'], // Setting Hind Vadodara as the default font
      },
      colors: {
        'custom-gray': '#FCFCFC', // Adding new color
        primary: '#7755FF', // Purple color for active links
        zinc: {
          150: '#e5e5e5', // Slightly darker than bg-zinc-100
        },
      },
    },
  },
  plugins: [],
};
