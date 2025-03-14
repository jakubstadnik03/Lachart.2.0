import React, { createContext, useContext } from 'react';
import { COLORS, CHART_STYLES, CHART_OPTIONS } from '../styles/theme';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const value = {
    colors: COLORS,
    chartStyles: CHART_STYLES,
    chartOptions: CHART_OPTIONS
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}; 