module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Hind Vadodara', 'sans-serif'], // Nastavení Hind Vadodara jako výchozího fontu
      },
      colors: {
          'custom-gray': '#FCFCFC', // Přidáš novou barvu
        primary: '#7755FF', // Fialová barva pro aktivní odkazy
        zinc: {
          150: '#e5e5e5', // Mírně tmavší než bg-zinc-100
        },
      },
    },
  },
  plugins: [],
};
