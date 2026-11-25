import { getAvatarBySportAndGender, getAthleteAvatar, avatarSportKey, defaultAvatarFor } from './avatarUtils';

describe('getAvatarBySportAndGender', () => {
  // The regression this file exists for: the photo picker saves a data: URL,
  // and the helper used to accept only http(s) and /-rooted paths. An uploaded
  // photo therefore failed every branch and fell through to the drawn avatar,
  // so Settings showed the new picture while every header and menu kept the
  // cartoon — indistinguishable, from the outside, from the upload failing.
  it('keeps an uploaded data: URL', () => {
    const avatar = 'data:image/jpeg;base64,/9j/4AAQSkZJRg';
    expect(getAvatarBySportAndGender({ avatar, gender: 'male', sport: 'run' })).toBe(avatar);
  });

  it('keeps a Strava https URL', () => {
    const avatar = 'https://dgalywyr863hv.cloudfront.net/pictures/athletes/1/large.jpg';
    expect(getAvatarBySportAndGender({ avatar })).toBe(avatar);
  });

  it('keeps a path under the public root', () => {
    expect(getAvatarBySportAndGender({ avatar: '/images/custom.webp' })).toBe('/images/custom.webp');
  });

  it('falls back to a drawn avatar when there is no photo', () => {
    const drawn = getAvatarBySportAndGender({ gender: 'male', sport: 'run' });
    expect(drawn.startsWith('/images/')).toBe(true);
  });

  it('gives a coach without a photo the branded default', () => {
    expect(getAvatarBySportAndGender({ role: 'coach' })).toBe('/images/coach-avatar.webp');
  });

  it('ignores a value that is neither a URL nor a path', () => {
    const drawn = getAvatarBySportAndGender({ avatar: 'not-an-image', gender: 'female', sport: 'bike' });
    expect(drawn.startsWith('/images/')).toBe(true);
  });

  it('defaultAvatarFor never returns the stored photo', () => {
    const avatar = 'data:image/jpeg;base64,AAAA';
    expect(defaultAvatarFor({ avatar, role: 'coach' })).toBe('/images/coach-avatar.webp');
  });
});

/**
 * These assert the exact file, not that something under /images/ came back.
 * The bug they cover was a real picture every time — the wrong one — so an
 * assertion that only checks the shape of the path cannot see it.
 */
describe('which drawn avatar', () => {
  it('gives a woman the woman, on every sport that has artwork', () => {
    // Running and swimming used to name the same file in both branches of the
    // isFemale test, so a female runner was drawn as a man.
    expect(getAvatarBySportAndGender({ gender: 'female', sport: 'running' })).toBe('/images/runner-female-avatar.jpeg');
    expect(getAvatarBySportAndGender({ gender: 'female', sport: 'swimming' })).toBe('/images/swimmer-female-avatar.jpeg');
    expect(getAvatarBySportAndGender({ gender: 'female', sport: 'cycling' })).toBe('/images/cyclist-female-avatar.jpeg');
    expect(getAvatarBySportAndGender({ gender: 'female', sport: 'triathlon' })).toBe('/images/triathlete-female-avatar.jpeg');
  });

  it('reads the short sport names the database actually holds', () => {
    // 243 accounts store `run` and 25 store `running`; 116 store `bike` and
    // 15 store `cycling`. Only the long ones were ever looked up, so nine in
    // ten athletes fell through to the generic figure.
    expect(getAvatarBySportAndGender({ gender: 'male', sport: 'run' })).toBe('/images/runner-avatar.jpeg');
    expect(getAvatarBySportAndGender({ gender: 'female', sport: 'run' })).toBe('/images/runner-female-avatar.jpeg');
    expect(getAvatarBySportAndGender({ gender: 'male', sport: 'bike' })).toBe('/images/cyclist-avatar.webp');
    expect(getAvatarBySportAndGender({ gender: 'female', sport: 'swim' })).toBe('/images/swimmer-female-avatar.jpeg');
    expect(getAvatarBySportAndGender({ gender: 'male', sport: 'tri' })).toBe('/images/triathlete-avatar.jpg');
  });

  it('is not fooled by case or stray spacing', () => {
    expect(avatarSportKey(' Run ')).toBe('running');
    expect(avatarSportKey('BIKE')).toBe('cycling');
  });

  it('falls back to the generic figure for a sport with no artwork', () => {
    // rowing, other, "not set" and an empty field. Inventing a picture for
    // these would be worse than the honest generic one.
    for (const sport of ['rowing', 'other', 'not set', '', undefined]) {
      expect(avatarSportKey(sport)).toBe('');
      expect(getAvatarBySportAndGender({ gender: 'female', sport })).toBe('/images/athlete-female-avatar.jpeg');
      expect(getAvatarBySportAndGender({ gender: 'male', sport })).toBe('/images/athlete-avatar.jpeg');
    }
  });

  it('draws the male figure when no gender is known, as it always has', () => {
    // Deliberate, not an oversight: the schema fills gender in on every
    // account, so changing this would repaint almost nobody.
    expect(getAvatarBySportAndGender({ sport: 'run' })).toBe('/images/runner-avatar.jpeg');
  });

  it('answers the same for an athlete in a coach\'s list', () => {
    // The two helpers were copies and drifted apart once already.
    const her = { gender: 'female', sport: 'run' };
    expect(getAthleteAvatar(her)).toBe(getAvatarBySportAndGender(her));
    const photo = 'data:image/jpeg;base64,AAAA';
    expect(getAthleteAvatar({ ...her, avatar: photo })).toBe(photo);
  });

  it('still lets a coach who runs keep the branded avatar', () => {
    expect(getAvatarBySportAndGender({ role: 'coach', sport: 'run', gender: 'female' })).toBe('/images/coach-avatar.webp');
    // ...but the same person in an athlete list is drawn as an athlete.
    expect(getAthleteAvatar({ role: 'coach', sport: 'run', gender: 'female' })).toBe('/images/runner-female-avatar.jpeg');
  });
});
