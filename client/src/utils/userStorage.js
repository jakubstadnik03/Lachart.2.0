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
    } : null
    // Explicitly exclude: athletes array, large nested objects, etc.
  };
};

/**
 * Safely save user data to localStorage with size check
 */
export const saveUserToStorage = (user) => {
  try {
    const userData = extractUserDataForStorage(user);
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

