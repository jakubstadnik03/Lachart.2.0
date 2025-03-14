export const convertPowerToPace = (power, sport) => {
  if (!power) return '';
  if (sport === 'bike') return `${power}W`;
  
  // Pro běh a plavání převádíme sekundy na formát mm:ss
  const seconds = parseInt(power);
  if (isNaN(seconds)) return power;
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}/km`;
};

// Pomocná funkce pro seřazení dat pro osu X
export const sortPaceValues = (values, sport) => {
  if (sport === 'bike') {
    return values.sort((a, b) => a - b); // Pro kolo: vzestupně (nižší -> vyšší watty)
  }
  return values.sort((a, b) => b - a); // Pro běh/plavání: sestupně (vyšší -> nižší čas)
};

// Pomocná funkce pro získání min/max hodnot osy
export const getPaceAxisLimits = (values, sport) => {
  if (sport === 'bike') {
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }
  return {
    min: Math.max(...values), // Pro běh/plavání: nejrychlejší tempo (nejnižší čas) vpravo
    max: Math.min(...values)  // Pro běh/plavání: nejpomalejší tempo (nejvyšší čas) vlevo
  };
}; 