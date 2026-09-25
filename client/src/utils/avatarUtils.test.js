import { getAvatarBySportAndGender, defaultAvatarFor } from './avatarUtils';

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
