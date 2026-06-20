/** Palettes + canvas fill for weekly share cards (dark / light). */

export const SHARE_THEMES = {
  dark: {
    canvas: '#0A0E1A',
    text: '#FFFFFF',
    muted: 'rgba(255,255,255,0.60)',
    faint: 'rgba(255,255,255,0.40)',
    surface: 'rgba(255,255,255,0.06)',
    surfaceHi: 'rgba(255,255,255,0.10)',
    border: 'rgba(255,255,255,0.12)',
    track: 'rgba(255,255,255,0.12)',
    divider: 'rgba(255,255,255,0.12)',
    wash: 'rgba(118,126,181,0.22)',
    routeShadow: 'rgba(0,0,0,0.45)',
    dotPeak: '#FF6B4A',
    pos: '#34D399',
    neg: '#F87171',
    coral: '#FF6B4A',
  },
  light: {
    canvas: '#F4F6FB',
    text: '#0F172A',
    muted: 'rgba(15,23,42,0.58)',
    faint: 'rgba(15,23,42,0.38)',
    surface: 'rgba(15,23,42,0.05)',
    surfaceHi: 'rgba(15,23,42,0.08)',
    border: 'rgba(15,23,42,0.10)',
    track: 'rgba(15,23,42,0.10)',
    divider: 'rgba(15,23,42,0.10)',
    wash: 'rgba(94,101,144,0.14)',
    routeShadow: 'rgba(15,23,42,0.18)',
    dotPeak: '#E85D3A',
    pos: '#059669',
    neg: '#DC2626',
    coral: '#E85D3A',
  },
};

export function sharePalette(theme = 'dark') {
  return SHARE_THEMES[theme] || SHARE_THEMES.dark;
}

export function shareCanvasColor(theme = 'dark') {
  return sharePalette(theme).canvas;
}
