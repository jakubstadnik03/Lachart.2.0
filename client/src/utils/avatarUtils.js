/**
 * The stock avatar for someone who has not uploaded a photo.
 *
 * Two things used to go wrong here, and both were invisible:
 *
 * 1. The sport map was keyed on the long names only — `running`, `cycling`,
 *    `swimming`. Most of the database stores the short ones: 243 accounts have
 *    sport `run` against 25 with `running`, and 116 have `bike` against 15
 *    with `cycling`. So nine out of ten athletes fell past their own sport and
 *    got the generic avatar, and nobody could tell, because the generic one is
 *    a perfectly good picture.
 *
 * 2. Running and swimming listed the same file in both branches of the
 *    `isFemale` test, so a woman got a man's picture — written as if a choice
 *    were being made. The female artwork simply did not exist; it does now.
 *
 * Anyone with a photo of their own is unaffected by all of this: a photo wins
 * before any of it is consulted.
 */

/** Short names (tests, the native app) and long ones (the profile pickers). */
const SPORT_ALIASES = {
  run: 'running',
  running: 'running',
  bike: 'cycling',
  cycling: 'cycling',
  cycle: 'cycling',
  swim: 'swimming',
  swimming: 'swimming',
  tri: 'triathlon',
  triathlon: 'triathlon',
};

/**
 * The sport this person's avatar should be drawn for, or '' when we have no
 * usable answer. `rowing`, `other`, `not set` and an empty field all land on
 * '' deliberately: there is no artwork for them, and the generic athlete is
 * the honest picture.
 */
export const avatarSportKey = (sport) => {
  const s = String(sport || '').trim().toLowerCase();
  return SPORT_ALIASES[s] || '';
};

const GENERIC = { male: '/images/athlete-avatar.jpeg', female: '/images/athlete-female-avatar.jpeg' };

/** One row per sport, so a missing female picture is visible as a gap here. */
const SPORT_AVATARS = {
  running:   { male: '/images/runner-avatar.jpeg',     female: '/images/runner-female-avatar.jpeg' },
  cycling:   { male: '/images/cyclist-avatar.webp',    female: '/images/cyclist-female-avatar.jpeg' },
  swimming:  { male: '/images/swimmer-avatar.jpeg',    female: '/images/swimmer-female-avatar.jpeg' },
  triathlon: { male: '/images/triathlete-avatar.jpg',  female: '/images/triathlete-female-avatar.jpeg' },
};

/**
 * A picture the person chose: a Strava/CDN URL, a path under /public, or the
 * data: URL the photo picker produces.
 *
 * data: was missing once, so an uploaded photo showed in Settings (which reads
 * user.avatar straight) and a cartoon everywhere that came through here —
 * which read as "the upload did not work".
 */
const ownPhoto = (value) => {
  const a = typeof value === 'string' ? value.trim() : '';
  if (!a) return null;
  if (a.startsWith('http://') || a.startsWith('https://') || a.startsWith('/') || a.startsWith('data:image/')) return a;
  return null;
};

/**
 * The drawn avatar for a person with no photo.
 *
 * Gender is read as given and only 'female' changes the picture — an unset
 * gender draws the male figure, as it always has. That default is wrong in
 * principle and is left alone on purpose: the schema fills the field in on
 * every account, so changing it here would repaint almost nobody and risk
 * surprising the few it did reach.
 */
const drawnAvatar = (person) => {
  const key = String(person?.gender || '').toLowerCase() === 'female' ? 'female' : 'male';
  const sport = avatarSportKey(person?.sport);
  return (SPORT_AVATARS[sport] || GENERIC)[key];
};

/**
 * Avatar for anyone the app shows — athlete or coach.
 * @param {Object} user sport, gender, avatar, role
 * @returns {String} avatar URL
 */
export const getAvatarBySportAndGender = (user) => {
  const photo = ownPhoto(user?.avatar);
  if (photo) return photo;

  // Coach without a photo: the branded default, whatever sport they train.
  if (user?.role === 'coach') return '/images/coach-avatar.webp';

  return drawnAvatar(user);
};

/**
 * Avatar for an athlete in a coach's lists, where nobody is a coach.
 *
 * Kept as its own name because the callers read better for it, but it shares
 * the logic above: the two used to be copies of each other and drifted — only
 * http(s) counted as a photo here, so one uploaded picture showed as a photo
 * in the athlete bar and as a cartoon on the Athletes list for the same person.
 *
 * @param {Object} athlete sport, gender, avatar
 * @returns {String} avatar URL
 */
export const getAthleteAvatar = (athlete) => ownPhoto(athlete?.avatar) || drawnAvatar(athlete);

/** The stock avatar this user would get without a photo. */
export const defaultAvatarFor = (user) => getAvatarBySportAndGender({ ...(user || {}), avatar: null });

/**
 * onError for an avatar <img>: swap in the stock avatar, once.
 *
 * A Strava profile picture URL stops working the day the athlete changes
 * the photo — the CDN answers 403 for the old one — and the app keeps the
 * URL it saved at connect time. Without this the header and the menu showed
 * a broken image with "User Avatar" under it.
 */
export const onAvatarError = (user) => (e) => {
  const img = e?.currentTarget;
  if (!img || img.dataset.avatarFallback) return;
  img.dataset.avatarFallback = '1';
  img.src = defaultAvatarFor(user);
};
