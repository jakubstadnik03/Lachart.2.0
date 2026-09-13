/**
 * A Strava picture URL that has died must not leave a broken image in the
 * header — the stock avatar takes its place, once.
 */
import { onAvatarError, defaultAvatarFor } from './avatarUtils';

describe('onAvatarError', () => {
  it('swaps a dead photo for the stock avatar of that user', () => {
    const img = document.createElement('img');
    img.src = 'https://dgalywyr863hv.cloudfront.net/pictures/athletes/1/2/3/medium.jpg';
    const coach = { role: 'coach', avatar: img.src };
    onAvatarError(coach)({ currentTarget: img });
    expect(img.getAttribute('src')).toBe('/images/coach-avatar.webp');
    expect(defaultAvatarFor({ sport: 'cycling', gender: 'female', avatar: 'x' })).toBe('/images/cyclist-female-avatar.jpeg');
  });

  it('gives up after one swap, so a missing stock file cannot loop', () => {
    const img = document.createElement('img');
    const handler = onAvatarError({ role: 'coach' });
    handler({ currentTarget: img });
    img.setAttribute('src', 'still-broken');
    handler({ currentTarget: img });
    expect(img.getAttribute('src')).toBe('still-broken');
  });
});
