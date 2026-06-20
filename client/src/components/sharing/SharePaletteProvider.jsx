import React, { createContext, useContext } from 'react';
import { sharePalette } from './shareTheme';

const PaletteContext = createContext(sharePalette('dark'));

export function useSharePalette() {
  return useContext(PaletteContext);
}

export default function SharePaletteProvider({ theme = 'dark', children }) {
  return (
    <PaletteContext.Provider value={sharePalette(theme)}>
      {children}
    </PaletteContext.Provider>
  );
}
