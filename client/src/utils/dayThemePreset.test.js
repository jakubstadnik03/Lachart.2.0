import { DAY_THEME_PRESETS, dayThemePresetColor } from './calendarThemes';

/**
 * The Recovery shortcut in the add-workout modal is a day theme with its title
 * already filled in. It only works because Recovery is a real preset with a
 * colour of its own — if that list is ever reworded, the shortcut silently
 * starts creating a free-text theme in neutral slate instead.
 */
describe('the Recovery day theme the shortcut relies on', () => {
  test('Recovery is one of the presets, spelled exactly that way', () => {
    expect(DAY_THEME_PRESETS).toContain('Recovery');
  });

  test('it has its own colour rather than falling back to neutral', () => {
    expect(dayThemePresetColor('Recovery')).toBe('#0d9488');
  });

  test('the colour lookup does not care about case or padding', () => {
    expect(dayThemePresetColor('  recovery ')).toBe('#0d9488');
    expect(dayThemePresetColor('RECOVERY')).toBe('#0d9488');
  });

  test('a title nobody defined has no colour, and says so', () => {
    expect(dayThemePresetColor('Chill vibes')).toBeNull();
    expect(dayThemePresetColor('')).toBeNull();
    expect(dayThemePresetColor(null)).toBeNull();
  });

  test('Recovery and Rest stay distinguishable', () => {
    // Two different days: one is easy training, the other is no training.
    expect(dayThemePresetColor('Recovery')).not.toBe(dayThemePresetColor('Rest'));
  });
});
