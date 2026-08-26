/**
 * Every one of these was a tap that silently did nothing in the running app.
 */
import { openGuideEntry } from './guideOpen';

const deps = () => ({ navigate: jest.fn(), openZones: jest.fn(), openExternal: jest.fn() });

describe('openGuideEntry', () => {
  it('navigates to an in-app destination', () => {
    const d = deps();
    expect(openGuideEntry({ href: '/training-calendar?plan=new' }, d)).toBe('navigate');
    expect(d.navigate).toHaveBeenCalledWith('/training-calendar?plan=new');
  });

  it('forces the zones modal open for an athlete who already has zones', () => {
    // Without force the listener returns early — profileNeedsTrainingZones is
    // false — and the tap does nothing at all.
    const d = deps();
    expect(openGuideEntry({ action: 'zones', href: '/profile' }, d)).toBe('zones');
    expect(d.openZones).toHaveBeenCalledWith({ force: true });
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('sends a coach to the page instead, because the modal ignores them', () => {
    const d = deps();
    expect(openGuideEntry({ action: 'zones', href: '/profile' }, { ...d, isCoach: true })).toBe('profile');
    expect(d.navigate).toHaveBeenCalledWith('/profile');
    expect(d.openZones).not.toHaveBeenCalled();
  });

  it('falls back to the profile when the entry forgot its href', () => {
    const d = deps();
    openGuideEntry({ action: 'zones' }, { ...d, isCoach: true });
    expect(d.navigate).toHaveBeenCalledWith('/profile');
  });

  it('opens an external link in a tab, not in the app', () => {
    const d = deps();
    expect(openGuideEntry({ href: 'https://apps.apple.com/app/id6764768876' }, d)).toBe('external');
    expect(d.openExternal).toHaveBeenCalledWith('https://apps.apple.com/app/id6764768876');
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('does nothing rather than crashing on a malformed entry', () => {
    const d = deps();
    expect(openGuideEntry(null, d)).toBe('nothing');
    expect(openGuideEntry({ title: 'no destination' }, d)).toBe('nothing');
    expect(d.navigate).not.toHaveBeenCalled();
  });
});
