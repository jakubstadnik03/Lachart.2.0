/**
 * Utility function to get avatar based on sport, gender, and Strava avatar
 * @param {Object} user - User object with sport, gender, avatar, role
 * @returns {String} Avatar URL
 */
export const getAvatarBySportAndGender = (user) => {
  // Coach always gets coach avatar (never show athlete/Strava URL in menu/header)
  if (user?.role === 'coach') {
    return '/images/coach-avatar.webp';
  }

  // If user has a Strava avatar (URL starting with http/https), use it
  if (user?.avatar && (user.avatar.startsWith('http://') || user.avatar.startsWith('https://'))) {
    return user.avatar;
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
