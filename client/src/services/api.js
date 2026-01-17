import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api.config';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

function getAuthToken() {
  return localStorage.getItem('token') || localStorage.getItem('authToken') || null;
}

// ===== API CALL MONITORING =====
// Enable/disable monitoring via localStorage or environment
const ENABLE_API_MONITORING = process.env.NODE_ENV === 'development' || localStorage.getItem('enableApiMonitoring') === 'true';

// Wrap fetch to also track API calls made via fetch (not just axios)
// This ensures all API calls are monitored, regardless of whether they use axios or fetch
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    const options = args[1] || {};
    const method = (options.method || 'GET').toUpperCase();
    
    // Only track if it's an API call (contains API_BASE_URL or starts with /api/ or /user/)
    const isApiCall = url.includes(API_BASE_URL) || 
                      url.startsWith('/api/') || 
                      url.startsWith('/user/') ||
                      url.startsWith('/test/') ||
                      url.startsWith('/training/');
    
    if (isApiCall && ENABLE_API_MONITORING) {
      const startTime = Date.now();
      const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
      const endpoint = `${method} ${fullUrl}`;
      
      return originalFetch.apply(this, args)
        .then((response) => {
          const duration = Date.now() - startTime;
          
          if (!apiCallStats.calls.has(endpoint)) {
            apiCallStats.calls.set(endpoint, {
              count: 0,
              totalTime: 0,
              lastCall: null,
              calls: [],
              method: method,
              url: url
            });
          }
          
          const stats = apiCallStats.calls.get(endpoint);
          stats.count++;
          stats.totalTime += duration;
          stats.lastCall = Date.now();
          stats.calls.push({
            timestamp: Date.now(),
            duration,
            cached: false
          });
          
          if (stats.calls.length > 50) {
            stats.calls.shift();
          }
          
          apiCallStats.totalCalls++;
          
          // Log to console
          const statusColor = response.ok ? '#009900' : '#ff9900';
          console.log(
            `%c[API-FETCH] ${method} ${url} ${response.status}`,
            `color: ${statusColor}`,
            `(${duration}ms)`
          );
          
          return response;
        })
        .catch((error) => {
          const duration = Date.now() - startTime;
          
          if (!apiCallStats.calls.has(endpoint)) {
            apiCallStats.calls.set(endpoint, {
              count: 0,
              totalTime: 0,
              lastCall: null,
              calls: [],
              method: method,
              url: url
            });
          }
          
          const stats = apiCallStats.calls.get(endpoint);
          stats.count++;
          stats.totalTime += duration;
          stats.lastCall = Date.now();
          apiCallStats.totalCalls++;
          
          console.log(
            `%c[API-FETCH] ${method} ${url} (ERROR)`,
            'color: #cc0000',
            `(${duration}ms)`
          );
          
          throw error;
        });
    }
    
    // Not an API call or monitoring disabled, use original fetch
    return originalFetch.apply(this, args);
  };
}

// API call statistics
const apiCallStats = {
  calls: new Map(), // endpoint -> { count, totalTime, lastCall, calls: [] }
  totalCalls: 0,
  startTime: Date.now()
};

// Helper to get endpoint key from config
function getEndpointKey(config) {
  const method = (config.method || 'get').toUpperCase();
  const url = config.url || '';
  const fullUrl = url.startsWith('http') ? url : `${config.baseURL || API_BASE_URL}${url}`;
  return `${method} ${fullUrl}`;
}

// Log API call
function logApiCall(config, startTime) {
  if (!ENABLE_API_MONITORING) return;
  
  const endpoint = getEndpointKey(config);
  const now = Date.now();
  const duration = now - startTime;
  
  if (!apiCallStats.calls.has(endpoint)) {
    apiCallStats.calls.set(endpoint, {
      count: 0,
      totalTime: 0,
      lastCall: null,
      calls: [],
      method: config.method || 'get',
      url: config.url || ''
    });
  }
  
  const stats = apiCallStats.calls.get(endpoint);
  stats.count++;
  stats.totalTime += duration;
  stats.lastCall = now;
  stats.calls.push({
    timestamp: now,
    duration,
    cached: config.__cached || false
  });
  
  // Keep only last 50 calls per endpoint
  if (stats.calls.length > 50) {
    stats.calls.shift();
  }
  
  apiCallStats.totalCalls++;
  
  // Log to console with color coding
  const cached = config.__cached ? ' (CACHED)' : '';
  const color = config.__cached ? 'color: #888' : 'color: #0066cc';
  console.log(
    `%c[API] ${config.method?.toUpperCase() || 'GET'} ${config.url || ''}${cached}`,
    color,
    `(${duration}ms)`
  );
}

// Expose stats to window for debugging
if (typeof window !== 'undefined') {
  window.__apiStats = {
    getStats: () => {
      const stats = {
        totalCalls: apiCallStats.totalCalls,
        uniqueEndpoints: apiCallStats.calls.size,
        uptime: Date.now() - apiCallStats.startTime,
        endpoints: {}
      };
      
      apiCallStats.calls.forEach((value, key) => {
        stats.endpoints[key] = {
          count: value.count,
          avgTime: Math.round(value.totalTime / value.count),
          totalTime: value.totalTime,
          lastCall: new Date(value.lastCall).toISOString(),
          method: value.method,
          url: value.url,
          recentCalls: value.calls.slice(-10) // Last 10 calls
        };
      });
      
      return stats;
    },
    printStats: () => {
      const stats = window.__apiStats.getStats();
      console.group('📊 API Call Statistics');
      console.log(`Total calls: ${stats.totalCalls}`);
      console.log(`Unique endpoints: ${stats.uniqueEndpoints}`);
      console.log(`Uptime: ${Math.round(stats.uptime / 1000)}s`);
      console.group('Endpoints:');
      Object.entries(stats.endpoints)
        .sort((a, b) => b[1].count - a[1].count)
        .forEach(([endpoint, data]) => {
          console.log(
            `%c${endpoint}`,
            'font-weight: bold',
            `- Called ${data.count}x, Avg: ${data.avgTime}ms, Last: ${new Date(data.lastCall).toLocaleTimeString()}`
          );
        });
      console.groupEnd();
      console.groupEnd();
      return stats;
    },
    clearStats: () => {
      apiCallStats.calls.clear();
      apiCallStats.totalCalls = 0;
      apiCallStats.startTime = Date.now();
      console.log('API stats cleared');
    },
    enable: () => {
      localStorage.setItem('enableApiMonitoring', 'true');
      console.log('API monitoring enabled');
    },
    disable: () => {
      localStorage.setItem('enableApiMonitoring', 'false');
      console.log('API monitoring disabled');
    }
  };
  
  // Auto-print stats on page unload in dev mode
  if (ENABLE_API_MONITORING) {
    window.addEventListener('beforeunload', () => {
      if (apiCallStats.totalCalls > 0) {
        console.log('📊 Final API stats before page unload:');
        window.__apiStats.printStats();
      }
    });
  }
}

// Add request interceptor to include auth token and track calls
api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Track API call start time
    config.__startTime = Date.now();
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Auth endpoints
export const login = async (credentials) => {
  try {
    const response = await api.post('/user/login', credentials, {
      headers: {
        'Content-Type': 'application/json',
      }
    });
    return response;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

export const logout = () => api.post('/user/logout');
export const register = (userData) => api.post('/user/register', userData);

// User endpoints
export const getCurrentUser = () => api.get('/user/current');
export const updateUser = (id, userData) => api.put(`/user/${id}`, userData);
export const getAllAthletes = () => api.get('/user/athletes');

// Training endpoints
export const getTrainingsByAthleteId = async (athleteId) => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('No token found');
    }
    
    const response = await api.get(`/training/athlete/${athleteId}`);
    return response;
  } catch (error) {
    console.error('Error fetching trainings:', error);
    throw error;
  }
};

export const getAllTrainings = () => api.get('/api/training');
export const getTrainingById = async (id) => {
  try {
    const response = await api.get(`/api/training/${id}`);
    return response.data; // Return data directly
  } catch (error) {
    console.error('Error fetching training by ID:', error);
    throw error;
  }
};
export const addTraining = (trainingData) => api.post('/training', trainingData);
export const updateTraining = (id, trainingData) => api.put(`/training/${id}`, trainingData);
export const deleteTraining = (id) => api.delete(`/training/${id}`);

// Test endpoints
export const getUserTests = () => api.get('/test/user');
export const getAllTests = () => api.get('/test');
export const getTestById = (id) => api.get(`/test/${id}`);
export const addTest = (testData) => api.post('/test', testData);
export const updateTest = (id, testData) => api.put(`/test/${id}`, testData);
export const deleteTest = (id) => api.delete(`/test/${id}`);
export const sendDemoTestEmail = (testData, email, name, userId = null) => api.post('/test/send-demo-email', { testData, email, name, userId });

export const getTestingsByAthleteId = async (athleteId) => {
  try {
    const response = await api.get(API_ENDPOINTS.ATHLETE_TESTS(athleteId));
    return response.data;
  } catch (error) {
    console.error('Error fetching athlete tests:', error);
    throw error;
  }
};

// Interceptor pro zpracování chyb a tracking
api.interceptors.response.use(
  (response) => {
    // Log successful API call
    if (response.config?.__startTime) {
      logApiCall(response.config, response.config.__startTime);
    }
    return response;
  },
  (error) => {
    // Log failed API call
    if (error.config?.__startTime) {
      logApiCall(error.config, error.config.__startTime);
    }
    
    // Silently handle 429 (Too Many Requests) errors - don't log them
    if (error.response?.status !== 429) {
      console.error('API Error:', error);
    }
    if (error.response?.status === 401) {
      // Remove both token keys for consistency
      localStorage.removeItem('authToken');
      localStorage.removeItem('token');
      // Don't automatically remove token on 401 - let AuthProvider handle it
      // This prevents race conditions where multiple requests fail simultaneously
    }
    return Promise.reject(error);
  }
);

// --- Lightweight GET caching + request coalescing (big UX win across the app) ---
// Prevents duplicate GETs fired by multiple components at once (Profile, Testing, Calendar, etc.).
// Default TTL is short to avoid staleness; callers can opt-out via { noCache: true } or { cacheTtlMs }.
const __getCache = new Map(); // key -> { expiresAt, response }
const __getInFlight = new Map(); // key -> Promise

// Export function to clear cache (used on logout)
export const clearApiCache = () => {
  __getCache.clear();
  __getInFlight.clear();
};

function stableStringify(obj) {
  if (!obj || typeof obj !== 'object') return String(obj ?? '');
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${k}:${stableStringify(obj[k])}`).join(',')}}`;
}

function buildGetCacheKey(url, config) {
  const token = getAuthToken() || '';
  const params = config?.params ? stableStringify(config.params) : '';
  // include baseURL because some code uses absolute URLs
  const base = config?.baseURL || api.defaults.baseURL || '';
  return `${token}::${base}::${url}::${params}`;
}

const __originalGet = api.get.bind(api);
api.get = (url, config = {}) => {
  const noCache = Boolean(config.noCache || config.headers?.['x-no-cache']);
  const responseType = config.responseType;
  // Skip caching for blobs/streams
  const cacheable = !noCache && (!responseType || responseType === 'json');
  if (!cacheable) return __originalGet(url, config);

  const key = buildGetCacheKey(url, config);
  const now = Date.now();
  const ttl = Number(config.cacheTtlMs) || 10000; // 10s default (reduced from 30s to improve data freshness)

  const hit = __getCache.get(key);
  if (hit && hit.expiresAt > now) {
    // Mark as cached for monitoring
    const cachedConfig = { ...config, __cached: true };
    if (ENABLE_API_MONITORING) {
      logApiCall(cachedConfig, now);
    }
    return Promise.resolve(hit.response);
  }

  const inFlight = __getInFlight.get(key);
  if (inFlight) return inFlight;

  const requestStartTime = Date.now();
  const p = __originalGet(url, config)
    .then((resp) => {
      // Only cache successful responses (status 200-299)
      if (resp && resp.status >= 200 && resp.status < 300) {
      __getCache.set(key, { expiresAt: now + ttl, response: resp });
      }
      // Track timing for monitoring
      if (resp.config) {
        resp.config.__startTime = requestStartTime;
      }
      return resp;
    })
    .catch((error) => {
      // Don't cache error responses
      // Track timing for monitoring
      if (error.config) {
        error.config.__startTime = requestStartTime;
      }
      throw error;
    })
    .finally(() => {
      __getInFlight.delete(key);
    });

  __getInFlight.set(key, p);
  return p;
};

export const updateUserProfile = async (userData) => {
  try {
    const response = await api.put('/user/edit-profile', userData);
    return response;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

export const changePassword = async (passwordData) => {
  try {
    const response = await api.post('/user/change-password', passwordData);
    return response;
  } catch (error) {
    console.error('Error changing password:', error);
    throw error;
  }
};

export const getTrainingTitles = async () => {
  try {
    const response = await api.get('/training/titles');
    return response.data;
  } catch (error) {
    console.error('Error fetching training titles:', error);
    throw error;
  }
};

export const getTrainingsByTitle = async (title) => {
  try {
    const response = await api.get(`/training/title/${encodeURIComponent(title)}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching trainings by title:', error);
    throw error;
  }
};

// Feedback endpoint
export const submitFeedback = async (payload) => {
  try {
    console.log('🚀 API: Submitting feedback to /feedback endpoint');
    
    const response = await api.post('/feedback', payload, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 25000 // 25 second timeout for Render.com
    });
    
    console.log('✅ API: Feedback response received:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ API: Error submitting feedback:', error.message);
    console.error('❌ API: Error code:', error.code);
    throw error;
  }
};

// Admin API functions
export const getAdminUsers = async () => {
  try {
    const response = await api.get('/user/admin/users');
    return response.data;
  } catch (error) {
    console.error('Error fetching admin users:', error);
    throw error;
  }
};

export const getAdminStats = async () => {
  try {
    const response = await api.get('/user/admin/stats');
    return response.data;
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    throw error;
  }
};

// Send reactivation email with latest lactate test to a specific user (admin only)
export const sendReactivationEmail = async (userId) => {
  try {
    const response = await api.post(`/user/admin/send-reactivation-email/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error sending reactivation email:', error);
    throw error;
  }
};

export const updateUserAdmin = async (userId, userData) => {
  try {
    const response = await api.put(`/user/admin/users/${userId}`, userData);
    return response.data;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};

// Lactate testing session endpoints
// Lactate Session API
export const createLactateSession = (sessionData) => api.post('/api/lactate-session', sessionData);
export const getLactateSessions = (athleteId) => api.get(`/api/lactate-session/athlete/${athleteId}`);
export const getLactateSessionById = (sessionId) => api.get(`/api/lactate-session/${sessionId}`);
export const updateLactateSession = (sessionId, updateData) => api.put(`/api/lactate-session/${sessionId}`, updateData);
export const completeLactateSession = (sessionId, completionData) => api.post(`/api/lactate-session/${sessionId}/complete`, completionData);
export const generateMockFitFile = (sessionId) => api.post(`/api/lactate-session/${sessionId}/mock-fit`);
export const deleteLactateSession = (sessionId) => api.delete(`/api/lactate-session/${sessionId}`);
export const downloadLactateSessionFit = async (sessionId) => {
  try {
    const response = await api.get(`/api/lactate-session/${sessionId}/download-fit`, {
      responseType: 'blob'
    });
    return response.data;
  } catch (error) {
    console.error('Error downloading FIT file:', error);
    throw error;
  }
};

// Legacy compatibility
export const saveLactateSession = createLactateSession;

// Fitness metrics endpoints
// Use a slightly longer cache TTL here because these are aggregate metrics that
// are relatively expensive to compute but don't change every second.
export const getFormFitnessData = (athleteId, days = 60, sport = 'all') => 
  api.get(`/user/athlete/${athleteId}/form-fitness`, {
    params: { days, sport },
    cacheTtlMs: 60000, // 60s cache – avoids repeated heavy aggregation on quick navigations
  });

export const getTodayMetrics = (athleteId) => 
  api.get(`/user/athlete/${athleteId}/today-metrics`, {
    cacheTtlMs: 60000,
  });

export const getTrainingStatus = (athleteId) => 
  api.get(`/user/athlete/${athleteId}/training-status`, {
    cacheTtlMs: 60000,
  });

export const getWeeklyTrainingLoad = (athleteId, months = 3, sport = 'all') => 
  api.get(`/user/athlete/${athleteId}/weekly-training-load`, {
    params: { months, sport },
    cacheTtlMs: 60000,
  });

export default api;

// FIT file upload endpoints
export const uploadFitFile = async (file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    const response = await api.post('/api/fit/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`
      },
      timeout: 60000 // 60 second timeout for large files
    });
    
    return response.data;
  } catch (error) {
    console.error('Error uploading FIT file:', error);
    throw error;
  }
};

export const getFitTrainings = async (athleteId = null) => {
  try {
    // Only send athleteId if it's provided and not null/undefined
    const params = athleteId ? { athleteId: String(athleteId) } : {};
    const response = await api.get('/api/fit/trainings', { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching FIT trainings:', error);
    throw error;
  }
};

export const getTrainingsWithLactate = async (athleteId = null) => {
  try {
    const params = athleteId ? { athleteId: String(athleteId) } : {};
    const response = await api.get('/api/fit/trainings/with-lactate', { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching trainings with lactate:', error);
    throw error;
  }
};

export const getMonthlyPowerAnalysis = async (athleteId = null, monthKey = null) => {
  try {
    const params = {};
    if (athleteId) params.athleteId = String(athleteId);
    if (monthKey) params.monthKey = monthKey;
    const response = await api.get('/api/fit/trainings/monthly-analysis', { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching monthly power analysis:', error);
    throw error;
  }
};

export const getLatestPowerZones = async () => {
  try {
    const response = await api.get('/api/lactate-session/zones/latest');
    return response.data;
  } catch (error) {
    console.error('Error fetching latest power zones:', error);
    throw error;
  }
};

export const savePowerZonesToProfile = async (zones) => {
  try {
    const response = await api.post('/api/lactate-session/zones/save', { zones });
    return response.data;
  } catch (error) {
    console.error('Error saving power zones to profile:', error);
    throw error;
  }
};

export const getFitTraining = async (id) => {
  try {
    const response = await api.get(`/api/fit/trainings/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching FIT training:', error);
    throw error;
  }
};

export const getAllTitles = async () => {
  try {
    const response = await api.get('/api/training/titles');
    return response.data;
  } catch (error) {
    console.error('Error fetching all titles:', error);
    throw error;
  }
};

export const updateLactateValues = async (trainingId, lactateValues) => {
  try {
    const response = await api.put(`/api/fit/trainings/${trainingId}/lactate`, {
      lactateValues
    });
    return response.data;
  } catch (error) {
    console.error('Error updating lactate values:', error);
    throw error;
  }
};

export const updateFitTraining = async (trainingId, { title, description, category, selectedLapIndices }) => {
  try {
    const response = await api.put(`/api/fit/trainings/${trainingId}`, {
      title,
      description,
      category,
      selectedLapIndices
    });
    return response.data;
  } catch (error) {
    console.error('Error updating training:', error);
    throw error;
  }
};

export const createLap = async (trainingId, { startTime, endTime }) => {
  try {
    const response = await api.post(`/api/fit/trainings/${trainingId}/laps`, {
      startTime,
      endTime
    });
    return response.data;
  } catch (error) {
    console.error('Error creating lap:', error);
    throw error;
  }
};

export const deleteFitTraining = async (trainingId) => {
  try {
    const response = await api.delete(`/api/fit/trainings/${trainingId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting FIT training:', error);
    throw error;
  }
};

// External integrations: Strava & Garmin (stubs)
export const getStravaAuthUrl = async () => {
  const { data } = await api.get('/api/integrations/strava/auth-url');
  return data.url;
};

export const startGarminAuth = async () => {
  const { data } = await api.get('/api/integrations/garmin/auth-url');
  return data.url;
};

export const syncStravaActivities = async (since=null) => {
  const { data } = await api.post('/api/integrations/strava/sync', { since }, {
    timeout: 600000 // 10 minutes timeout for large syncs (200 pages × 2 seconds = ~6-7 minutes max)
  });
  return data; // { imported, updated }
};

// Track in-flight auto-sync to prevent multiple simultaneous syncs
let stravaAutoSyncInFlight = false;
let garminAutoSyncInFlight = false;

export const autoSyncStravaActivities = async () => {
  // Prevent multiple simultaneous syncs
  if (stravaAutoSyncInFlight) {
    console.log('Strava auto-sync already in progress, skipping...');
    return { imported: 0, updated: 0 };
  }

  // Check for 429 errors in recent attempts (prevent rapid retries)
  const last429Key = 'strava_auto_sync_last_429';
  const last429 = localStorage.getItem(last429Key);
  const now = Date.now();
  if (last429 && (now - parseInt(last429)) < 60000) { // Wait 1 minute after 429
    console.log('Strava auto-sync: Too many requests, waiting...');
    return { imported: 0, updated: 0 };
  }

  stravaAutoSyncInFlight = true;
  try {
    const { data } = await api.post('/api/integrations/strava/auto-sync', {}, {
      timeout: 120000 // 2 minutes timeout for auto-sync
    });
    // Clear 429 flag on success
    localStorage.removeItem(last429Key);
    return data; // { imported, updated }
  } catch (error) {
    // Handle 429 (Too Many Requests) gracefully
    if (error.response?.status === 429) {
      console.log('Strava auto-sync: Rate limited (429), will retry later');
      localStorage.setItem(last429Key, now.toString());
      return { imported: 0, updated: 0 };
    }
    // Silently fail for other errors - don't show errors to user
    console.log('Auto-sync failed:', error);
    return { imported: 0, updated: 0 };
  } finally {
    stravaAutoSyncInFlight = false;
  }
};

export const syncGarminActivities = async (since=null) => {
  const { data } = await api.post('/api/integrations/garmin/sync', { since }, {
    timeout: 600000 // 10 minutes timeout for large syncs
  });
  return data; // { imported, updated }
};

export const autoSyncGarminActivities = async () => {
  // Prevent multiple simultaneous syncs
  if (garminAutoSyncInFlight) {
    console.log('Garmin auto-sync already in progress, skipping...');
    return { imported: 0, updated: 0 };
  }

  // Check for 429 errors in recent attempts (prevent rapid retries)
  const last429Key = 'garmin_auto_sync_last_429';
  const last429 = localStorage.getItem(last429Key);
  const now = Date.now();
  if (last429 && (now - parseInt(last429)) < 60000) { // Wait 1 minute after 429
    console.log('Garmin auto-sync: Too many requests, waiting...');
    return { imported: 0, updated: 0 };
  }

  garminAutoSyncInFlight = true;
  try {
    const { data } = await api.post('/api/integrations/garmin/auto-sync', {}, {
      timeout: 120000 // 2 minutes timeout for auto-sync
    });
    // Clear 429 flag on success
    localStorage.removeItem(last429Key);
    return data; // { imported, updated }
  } catch (error) {
    // Handle 429 (Too Many Requests) gracefully
    if (error.response?.status === 429) {
      console.log('Garmin auto-sync: Rate limited (429), will retry later');
      localStorage.setItem(last429Key, now.toString());
      return { imported: 0, updated: 0 };
    }
    // Silently fail for other errors - don't show errors to user
    console.log('Garmin auto-sync failed:', error);
    return { imported: 0, updated: 0 };
  } finally {
    garminAutoSyncInFlight = false;
  }
};

export const garminLogin = async (credentials) => {
  const { data } = await api.post('/api/integrations/garmin/login', credentials);
  return data; // { success, message }
};

export const listExternalActivities = async (params={}) => {
  const { data } = await api.get('/api/integrations/activities', { params });
  return data; // normalized activities
};

export const getIntegrationStatus = async () => {
  const { data } = await api.get('/api/integrations/status');
  return data; // { stravaConnected, garminConnected }
};

export const updateAvatarFromStrava = async () => {
  const { data } = await api.post('/api/integrations/strava/update-avatar');
  return data; // { success, avatar, message }
};

export const getStravaActivityDetail = async (stravaId, athleteId = null) => {
  const params = athleteId ? { athleteId } : {};
  const { data } = await api.get(`/api/integrations/strava/activities/${stravaId}`, { params });
  return data; // { detail, streams, laps, titleManual, description }
};

export const updateStravaActivity = async (stravaId, { title, description, category }) => {
  try {
    const response = await api.put(`/api/integrations/strava/activities/${stravaId}`, {
      title,
      description,
      category
    });
    return response.data;
  } catch (error) {
    console.error('Error updating Strava activity:', error);
    throw error;
  }
};

export const updateStravaLactateValues = async (stravaId, lactateValues) => {
  try {
    const response = await api.put(`/api/integrations/strava/activities/${stravaId}/lactate`, {
      lactateValues
    });
    return response.data;
  } catch (error) {
    console.error('Error updating Strava lactate values:', error);
    throw error;
  }
};

export const createStravaLap = async (stravaId, { startTime, endTime }) => {
  try {
    const response = await api.post(`/api/integrations/strava/activities/${stravaId}/laps`, {
      startTime,
      endTime
    });
    return response.data;
  } catch (error) {
    console.error('Error creating Strava lap:', error);
    throw error;
  }
};

export const createStravaLapsBulk = async (stravaId, intervals = []) => {
  try {
    const response = await api.post(`/api/integrations/strava/activities/${stravaId}/laps/bulk`, {
      intervals
    });
    return response.data;
  } catch (error) {
    console.error('Error creating Strava laps in bulk:', error);
    throw error;
  }
};

export const deleteStravaLap = async (stravaId, lapIndex) => {
  try {
    const response = await api.delete(`/api/integrations/strava/activities/${stravaId}/laps/${lapIndex}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting Strava lap:', error);
    throw error;
  }
};

// Workout Clustering API
export const extractWorkoutPattern = async (workoutId, ftp = null) => {
  const { data } = await api.post(`/api/workout-clustering/extract/${workoutId}`, { ftp });
  return data;
};

export const clusterWorkouts = async (ftp = null, eps = 0.25, minPts = 3) => {
  const { data } = await api.post('/api/workout-clustering/cluster', { ftp, eps, minPts });
  return data;
};

export const getClusters = async () => {
  const { data } = await api.get('/api/workout-clustering/clusters');
  return data;
};

export const updateClusterTitle = async (clusterId, title, trainingRouteId = null) => {
  const { data } = await api.put(`/api/workout-clustering/cluster/${clusterId}/title`, { title, trainingRouteId });
  return data;
};

export const getSimilarWorkouts = async (workoutId, threshold = 0.75) => {
  const { data } = await api.get(`/api/workout-clustering/similar/${workoutId}`, { params: { threshold } });
  return data;
}; 