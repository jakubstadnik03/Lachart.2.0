/**
 * Utility function to get avatar based on sport, gender, and Strava avatar
 * @param {Object} user - User object with sport, gender, avatar, role
 * @returns {String} Avatar URL
 */
export const getAvatarBySportAndGender = (user) => {
  const av = user?.avatar;
  if (av && typeof av === 'string') {
    const a = av.trim();
    // Strava / CDN / a file under the public path — and a data: URL, which is
    // what the photo picker produces.
    //
    // That last one was missing, so an uploaded photo failed every test here
    // and the function fell through to the drawn avatar. The picture was saved
    // and showed in Settings (which reads user.avatar straight), while every
    // header and menu that goes through this helper kept the cartoon — which
    // read as "the upload did not work".
    if (
      a.startsWith('http://') ||
      a.startsWith('https://') ||
      a.startsWith('/') ||
      a.startsWith('data:image/')
    ) {
      return a;
    }
  }

  // Coach without a custom photo: branded default (menu/header/profile)
  if (user?.role === 'coach') {
    return '/images/coach-avatar.webp';
  }

  // Default gender to 'male' if not specified
  const gender = user?.gender || 'male';
  const sport = user?.sport?.toLowerCase() || '';
  const isFemale = gender === 'female';

  // Map sports to avatar paths
  const avatarMap = {
    triathlon: isFemale ? '/images/triathlete-female-avatar.jpeg' : '/images/triathlete-avatar.jpg',
    running: isFemale ? '/images/runner-avatar.jpeg' : '/images/runner-avatar.jpeg', // Assuming runner avatars are unisex or we need to add female versions
    cycling: isFemale ? '/images/cyclist-female-avatar.jpeg' : '/images/cyclist-avatar.webp',
    swimming: isFemale ? '/images/swimmer-avatar.jpeg' : '/images/swimmer-avatar.jpeg', // Assuming swimmer avatars are unisex or we need to add female versions
  };

  // If sport is found in map, return corresponding avatar
  if (avatarMap[sport]) {
    return avatarMap[sport];
  }

  // Default fallback: athlete avatar based on gender
  return isFemale ? '/images/athlete-female-avatar.jpeg' : '/images/athlete-avatar.jpeg';
};

/**
 * Get avatar for athlete profile (with fallback to athlete avatar if no sport)
 * @param {Object} athlete - Athlete object with sport, gender, avatar
 * @returns {String} Avatar URL
 */
export const getAthleteAvatar = (athlete) => {
  // If athlete has a Strava avatar (URL starting with http/https), use it
  if (athlete?.avatar && (athlete.avatar.startsWith('http://') || athlete.avatar.startsWith('https://'))) {
    return athlete.avatar;
  }

  // Default gender to 'male' if not specified
  const gender = athlete?.gender || 'male';
  const sport = athlete?.sport?.toLowerCase() || '';
  const isFemale = gender === 'female';

  // If no sport is set, use athlete avatar
  if (!sport) {
    return isFemale ? '/images/athlete-female-avatar.jpeg' : '/images/athlete-avatar.jpeg';
  }

  // Map sports to avatar paths
  const avatarMap = {
    triathlon: isFemale ? '/images/triathlete-female-avatar.jpeg' : '/images/triathlete-avatar.jpg',
    running: isFemale ? '/images/runner-avatar.jpeg' : '/images/runner-avatar.jpeg',
    cycling: isFemale ? '/images/cyclist-female-avatar.jpeg' : '/images/cyclist-avatar.webp',
    swimming: isFemale ? '/images/swimmer-avatar.jpeg' : '/images/swimmer-avatar.jpeg',
  };

  // If sport is found in map, return corresponding avatar
  if (avatarMap[sport]) {
    return avatarMap[sport];
  }

  // Default fallback: athlete avatar based on gender
  return isFemale ? '/images/athlete-female-avatar.jpeg' : '/images/athlete-avatar.jpeg';
};

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
