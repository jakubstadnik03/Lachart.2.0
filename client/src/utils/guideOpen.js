/**
 * What tapping a card in the guide should do.
 *
 * Kept out of the component because the decision has real edge cases and they
 * are invisible from the outside: a card that "does nothing" looks exactly
 * like a card that is still loading. The training-zones one was dead for
 * anybody who already had zones, because the modal's own listener ignores the
 * event unless it carries force — and ignores coaches entirely, whose zones
 * live on the profile page.
 */

/**
 * @param {object} entry a FEATURE_ENTRIES row
 * @param {{isCoach?: boolean, navigate: Function, openZones: Function,
 *          openExternal?: Function}} deps
 * @returns {'zones'|'profile'|'external'|'navigate'|'nothing'} what it did
 */
export function openGuideEntry(entry, { isCoach = false, navigate, openZones, openExternal } = {}) {
  if (!entry) return 'nothing';

  if (entry.action === 'zones') {
    // The shell only opens the athlete zones modal; a coach gets the page.
    if (isCoach) {
      navigate?.(entry.href || '/profile');
      return 'profile';
    }
    openZones?.({ force: true });
    return 'zones';
  }

  if (!entry.href) return 'nothing';

  if (/^https?:\/\//.test(entry.href)) {
    (openExternal || ((url) => window.open(url, '_blank', 'noopener')))(entry.href);
    return 'external';
  }

  navigate?.(entry.href);
  return 'navigate';
}

export default openGuideEntry;
