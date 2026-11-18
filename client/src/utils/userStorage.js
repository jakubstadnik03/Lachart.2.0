/**
 * Helper function to extract only essential user data for localStorage
 * This prevents localStorage quota exceeded errors by storing only necessary data
 */
export const extractUserDataForStorage = (user) => {
  if (!user) return null;
  
  // Extract only essential fields - exclude large objects that aren't needed in localStorage
  return {
    _id: user._id,
    name: user.name,
    surname: user.surname,
    email: user.email,
    role: user.role,
    admin: user.admin,
    dateOfBirth: user.dateOfBirth,
    address: user.address,
    phone: user.phone,
    height: user.height,
    weight: user.weight,
    sport: user.sport,
    specialization: user.specialization,
    bio: user.bio,
    avatar: user.avatar,
    coachId: user.coachId,
    // Include powerZones and heartRateZones (they should be small enough)
    powerZones: user.powerZones || null,
    heartRateZones: user.heartRateZones || null,
    units: user.units || { distance: 'metric', weight: 'kg', temperature: 'celsius' },
    strava: user.strava ? {
      athleteId: user.strava.athleteId,
      autoSync: user.strava.autoSync !== undefined ? user.strava.autoSync : false,
      lastSyncDate: user.strava.lastSyncDate
      // Don't include tokens
    } : null,
    coachBranding: user.coachBranding
      ? {
          logoUrl:      user.coachBranding.logoUrl      ?? null,
          title:        user.coachBranding.title        ?? null,
          subtitle:     user.coachBranding.subtitle     ?? null,
          trademark:    user.coachBranding.trademark    ?? null,
          primaryColor: user.coachBranding.primaryColor ?? null,
          email:        user.coachBranding.email        ?? null,
          web:          user.coachBranding.web          ?? null,
          phone:        user.coachBranding.phone        ?? null,
        }
      : null,
    // Premium state. Without it a paying user restored from this cache —
    // every app open until /user/profile answers, and for good when that call
    // fails (a Render 502, a cold start past the timeout) — was treated as
    // free: "Upgrade to Pro" over their own test history, the 30-day lock on
    // the calendar, the "Try Pro" banner. The server still enforces access;
    // this only stops the UI from walling off what the user has paid for.
    // Left undefined when the source never said, so an old cache stays
    // recognisably "not resolved" (see usePremium).
    ...(typeof user.isPremium === 'boolean' ? { isPremium: user.isPremium } : {}),
    ...(user.premiumSource ? { premiumSource: user.premiumSource } : {}),
    ...(user.premium === true ? { premium: true } : {}),
    ...(user.coachedAccess ? { coachedAccess: user.coachedAccess } : {}),
    // Explicitly exclude: athletes array, large nested objects, etc.
  };
};

const PREMIUM_KEYS = ['isPremium', 'premiumSource', 'premium', 'coachedAccess'];

/**
 * Keep the premium state we already know when an update does not carry it.
 *
 * Several settings calls answer with a user object that has no isPremium
 * (it is computed per request, never stored on the user). Taking that object
 * as-is wiped a paying user's premium state in memory and in the cache, and
 * the paywalls came back. Only copies within the same account, and only when
 * the update says nothing about premium itself.
 */
export const carryPremiumState = (prev, next) => {
  if (!next || typeof next !== 'object') return next;
  if (typeof next.isPremium === 'boolean') return next;
  if (!prev || typeof prev.isPremium !== 'boolean') return next;
  if (!prev._id || !next._id || String(prev._id) !== String(next._id)) return next;
  const carried = { ...next };
  PREMIUM_KEYS.forEach((k) => {
    if (prev[k] !== undefined && carried[k] === undefined) carried[k] = prev[k];
  });
  return carried;
};

const readCachedUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Safely save user data to localStorage with size check
 */
export const saveUserToStorage = (user) => {
  try {
    const userData = extractUserDataForStorage(carryPremiumState(readCachedUser(), user));
    const jsonString = JSON.stringify(userData);
    
    // Check size (localStorage limit is usually 5-10MB)
    const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
    if (sizeInMB > 4) {
      console.warn('User data is large:', sizeInMB.toFixed(2), 'MB');
      // Try to save anyway, but log warning
    }
    
    localStorage.setItem('user', jsonString);
    return true;
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded. Attempting to clear old data...');
      // Try to clear some old data
      try {
        // Clear old user data and try again with minimal data
        localStorage.removeItem('user');
        const minimalUser = {
          _id: user._id,
          email: user.email,
          role: user.role,
          units: user.units || { distance: 'metric', weight: 'kg', temperature: 'celsius' }
        };
        localStorage.setItem('user', JSON.stringify(minimalUser));
        console.warn('Saved minimal user data due to quota exceeded');
        return true;
      } catch (retryError) {
        console.error('Failed to save even minimal user data:', retryError);
        return false;
      }
    }
    console.error('Error saving user to localStorage:', error);
    return false;
  }
};

