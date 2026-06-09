import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api.config';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 60000, // 60s – allows hosted server (e.g. Render) cold start to respond
  headers: {
    'Content-Type': 'application/json'
  }
});

function getAuthToken() {
  return localStorage.getItem('token') || localStorage.getItem('authToken') || null;
}

// ===== API CALL MONITORING =====
// Enable/disable monitoring via localStorage or environment
const ENABLE_API_MONITORING = localStorage.getItem('enableApiMonitoring') === 'true';

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
    if (!config) return config;
    config.headers = config.headers || {};
    // U login/register nikdy neposílat starý token – jinak by mohl server nebo cache
    // vrátit data předchozího účtu
    const url = String(config.baseURL || '') + String(config.url || '');
    const isAuthEndpoint = /\/user\/(login|register)(\?|$|\/)/.test(url);
    if (!isAuthEndpoint) {
      const token = getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } else {
      delete config.headers.Authorization;
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
export const addTraining = (trainingData) => api.post('/training', trainingData).then(r => { invalidateTrainingCaches(); return r; });
export const updateTraining = (id, trainingData) => api.put(`/training/${id}`, trainingData).then(r => { invalidateTrainingCaches(); return r; });
export const deleteTraining = (id) => api.delete(`/training/${id}`).then(r => { invalidateTrainingCaches(); return r; });

// Test endpoints
export const getUserTests = () => api.get('/test/user');
export const getAllTests = () => api.get('/test');
export const getTestById = (id) => api.get(`/test/${id}`);
export const addTest = (testData) => api.post('/test', testData).then(r => { invalidateTestCaches(); return r; });
export const updateTest = (id, testData) => api.put(`/test/${id}`, testData).then(r => { invalidateTestCaches(); return r; });
export const deleteTest = (id) => api.delete(`/test/${id}`).then(r => { invalidateTestCaches(); return r; });
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

// ── Critical Power (CP) tests ───────────────────────────────────────────────
// Trainer-facing comparison tool — sustained max-effort durations vs power
// give CP/W'. Stored alongside lactate tests; the UI lets coaches compare
// CP against LT2 from the same athlete's most recent lactate test.
export const getCPTestsByAthleteId = async (athleteId) => {
  const { data } = await api.get(`/api/cp-test/athlete/${athleteId}`);
  return data;
};
export const getCPTest    = (id)               => api.get(`/api/cp-test/${id}`).then(r => r.data);
export const addCPTest    = (test)             => api.post('/api/cp-test', test).then(r => r.data);
export const updateCPTest = (id, test)         => api.put(`/api/cp-test/${id}`, test).then(r => r.data);
export const deleteCPTest = (id)               => api.delete(`/api/cp-test/${id}`).then(r => r.data);
export const getCPStravaBestEfforts = (athleteId, sport, durations, days = 180) =>
  api.get(`/api/cp-test/strava-best-efforts/${athleteId}`, {
    params: { sport, durations: durations.join(','), days },
  }).then(r => r.data);

// ── VLamax (sprint test for maximum lactate production rate) ────────────────
export const getVLamaxTestsByAthleteId = async (athleteId) => {
  const { data } = await api.get(`/api/vlamax-test/athlete/${athleteId}`);
  return data;
};
export const addVLamaxTest    = (test)     => api.post('/api/vlamax-test', test).then(r => r.data);
export const updateVLamaxTest = (id, test) => api.put(`/api/vlamax-test/${id}`, test).then(r => r.data);
export const deleteVLamaxTest = (id)       => api.delete(`/api/vlamax-test/${id}`).then(r => r.data);

// Interceptor pro zpracování chyb a tracking
api.interceptors.response.use(
  (response) => {
    if (response.config?.__startTime) {
      logApiCall(response.config, response.config.__startTime);
    }
    // Clear one-time network error flag so future failures are logged again after recovery
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('api_network_error_logged');
    return response;
  },
  (error) => {
    if (error.config?.__startTime) {
      logApiCall(error.config, error.config.__startTime);
    }

    // Log network/CORS errors only once per session to avoid console spam
    const isNetworkError = error.code === 'ERR_NETWORK' || error.message === 'Network Error';
    if (isNetworkError) {
      const lastLogged = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('api_network_error_logged');
      if (!lastLogged) {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('api_network_error_logged', '1');
        console.warn(
          '[API] Network or CORS error. If running on localhost, set ALLOW_LOCALHOST_ORIGIN=true on the server or use the same origin.'
        );
      }
    } else if (
      error.code !== 'ERR_CANCELED' &&
      error.name !== 'CanceledError' &&
      error.response?.status !== 429 &&
      !error.config?.suppressErrorLog
    ) {
      console.error('API Error:', error);
    }

    if (error.response?.status === 401) {
      // Neodhlašovat globálně u přihlášení/registrace — vracejí 401 při špatných údajích;
      // axios defaults mohou mít pořád starý Bearer, takže by se jinak smazala platná relace.
      // Also skip logout for Strava/Garmin integration endpoints — those can 401 due to a third-party
      // OAuth token expiry, which is unrelated to the LaChart session. The backend translates
      // Strava 401 → 400 but we add this belt-and-suspenders guard too.
      // /api/integrations/status and /api/integrations/activities also fall under this umbrella:
      // they are gated by the LaChart JWT but a transient 401 (e.g. timing on first render after
      // login before the token fully propagates) should NOT blow away a valid session.
      const reqUrl = String(error.config?.url || '');
      const isCredentialAuthEndpoint =
        /\/user\/(login|register)(\?|$|\/)/.test(reqUrl);
      const isIntegrationEndpoint = reqUrl.includes('/strava/')
        || reqUrl.includes('/garmin/')
        || reqUrl.includes('/api/integrations/');
      if (!isCredentialAuthEndpoint && !isIntegrationEndpoint) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        if (api.defaults?.headers?.common) delete api.defaults.headers.common.Authorization;
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
      }
    }

    if (
      error.response?.status === 403 &&
      error.response?.data?.code === 'PREMIUM_REQUIRED' &&
      typeof window !== 'undefined' &&
      window.dispatchEvent
    ) {
      window.dispatchEvent(
        new CustomEvent('app:premium-required', { detail: error.response.data })
      );
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
  // Remove all localStorage API cache entries
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('api_cache_')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
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
  const base = config?.baseURL || api.defaults.baseURL || '';
  return `${token}::${base}::${url}::${params}`;
}

// URL patterns that benefit from longer in-memory TTL + localStorage persistence.
// These endpoints return large or stable data that rarely changes during a session.
const LONG_CACHE_PATTERNS = [
  { pattern: /\/test\/list\//, ttl: 120000, lsKey: 'api_cache_tests' },
  { pattern: /\/user\/athlete\/[^/]+\/trainings$/, ttl: 120000, lsKey: 'api_cache_trainings' },
  { pattern: /\/api\/fit\/trainings$/, ttl: 120000, lsKey: 'api_cache_fit_trainings' },
  { pattern: /\/api\/fit\/trainings\/with-lactate/, ttl: 120000, lsKey: 'api_cache_fit_lactate' },
  { pattern: /\/api\/fit\/trainings\/monthly-analysis/, ttl: 120000, lsKey: 'api_cache_fit_monthly' },
  { pattern: /\/api\/fit\/power-metrics/, ttl: 120000, lsKey: 'api_cache_power_metrics' },
  { pattern: /\/api\/integrations\/status$/, ttl: 60000 },
  { pattern: /\/api\/integrations\/activities$/, ttl: 120000, lsKey: 'api_cache_ext_activities' },
  { pattern: /\/api\/lactate-session\/zones\/latest/, ttl: 120000, lsKey: 'api_cache_zones_latest' },
  { pattern: /\/user\/athlete\/[^/]+\/form-fitness/, ttl: 300000, lsKey: 'api_cache_form_fitness' },
  { pattern: /\/user\/athlete\/[^/]+\/weekly-training-load/, ttl: 300000, lsKey: 'api_cache_weekly_load' },
  { pattern: /\/user\/athlete\/[^/]+\/today-metrics/, ttl: 120000 },
  { pattern: /\/user\/profile$/, ttl: 60000, lsKey: 'api_cache_profile' },
];
const LS_CACHE_MAX_AGE = 10 * 60 * 1000; // localStorage entries valid for 10 minutes

function matchLongCache(url) {
  for (const entry of LONG_CACHE_PATTERNS) {
    if (entry.pattern.test(url)) return entry;
  }
  return null;
}

function lsCacheKey(baseKey, url, config) {
  const token = getAuthToken() || '';
  const uid = token.slice(-8);
  const params = config?.params ? stableStringify(config.params) : '';
  return `${baseKey}_${uid}_${url}_${params}`;
}

function lsCacheRead(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > LS_CACHE_MAX_AGE) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch { return null; }
}

function lsCacheWrite(key, data) {
  try {
    const payload = JSON.stringify({ ts: Date.now(), data });
    if (payload.length > 2 * 1024 * 1024) return; // skip if > 2MB
    localStorage.setItem(key, payload);
  } catch { /* quota exceeded – silently ignore */ }
}

const __originalGet = api.get.bind(api);
const PROFILE_IN_FLIGHT_KEY = '__profile_in_flight__';
api.get = (url, config = {}) => {
  const noCache = Boolean(config.noCache || config.headers?.['x-no-cache']);
  const responseType = config.responseType;
  const isProfileGet = typeof url === 'string' && (url === '/user/profile' || url.endsWith('/user/profile'));
  const cacheable = !noCache && (!responseType || responseType === 'json');
  if (!cacheable && !isProfileGet) return __originalGet(url, config);

  const key = isProfileGet ? PROFILE_IN_FLIGHT_KEY : buildGetCacheKey(url, config);
  const now = Date.now();
  const longEntry = matchLongCache(url);
  const ttl = Number(config.cacheTtlMs) || (longEntry ? longEntry.ttl : 10000);

  // 1. Check in-memory cache
  if (!isProfileGet || !noCache) {
    const hit = __getCache.get(key);
    if (hit && hit.expiresAt > now) {
      const cachedConfig = { ...config, __cached: true };
      if (ENABLE_API_MONITORING) {
        logApiCall(cachedConfig, now);
      }
      return Promise.resolve(hit.response);
    }
  }

  // 2. Check localStorage cache (for heavy endpoints) before network
  if (longEntry?.lsKey && !noCache) {
    const lsData = lsCacheRead(lsCacheKey(longEntry.lsKey, url, config));
    if (lsData) {
      const syntheticResp = { data: lsData, status: 200, statusText: 'OK', headers: {}, config: { ...config, url, __cached: true, __startTime: now } };
      // Populate in-memory cache with shorter TTL to avoid repeated LS reads
      __getCache.set(key, { expiresAt: now + ttl, response: syntheticResp });
      if (ENABLE_API_MONITORING) {
        logApiCall({ ...config, __cached: true }, now);
      }
      return Promise.resolve(syntheticResp);
    }
  }

  const inFlight = __getInFlight.get(key);
  if (inFlight) return inFlight;

  const requestStartTime = Date.now();
  const p = __originalGet(url, config)
    .then((resp) => {
      if (resp && resp.status >= 200 && resp.status < 300 && (!isProfileGet || !noCache)) {
        __getCache.set(key, { expiresAt: now + ttl, response: resp });
        // Persist to localStorage for heavy endpoints
        if (longEntry?.lsKey && resp.data) {
          lsCacheWrite(lsCacheKey(longEntry.lsKey, url, config), resp.data);
        }
      }
      if (resp.config) {
        resp.config.__startTime = requestStartTime;
      }
      return resp;
    })
    .catch((error) => {
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

/**
 * Invalidate both in-memory and localStorage caches for a given URL pattern.
 * Call after any mutation (POST/PUT/DELETE) that changes the data an endpoint returns.
 */
export function invalidateCache(urlPattern) {
  // In-memory: drop matching keys
  for (const [key] of __getCache) {
    if (key.includes(urlPattern)) __getCache.delete(key);
  }
  // localStorage: drop matching keys
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('api_cache_') && k.includes(urlPattern)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

function invalidateProfileCaches() {
  invalidateCache('/user/profile');
  __getCache.delete(PROFILE_IN_FLIGHT_KEY);
}

function invalidateTestCaches() {
  invalidateCache('/test/');
  invalidateCache('api_cache_tests');
  invalidateCache('api_cache_zones_latest');
}

function invalidateTrainingCaches() {
  invalidateCache('/training/');
  invalidateCache('/trainings');
  invalidateCache('api_cache_trainings');
  invalidateCache('api_cache_fit_trainings');
  invalidateCache('api_cache_fit_lactate');
  invalidateCache('api_cache_fit_monthly');
  invalidateCache('api_cache_power_metrics');
  invalidateCache('api_cache_ext_activities');
  invalidateCache('api_cache_form_fitness');
  invalidateCache('api_cache_weekly_load');
  // Also clear the TrainingPage localStorage cache (athleteTrainings_v3_*)
  // so the next loadTrainings call shows fresh data with updated lactate values.
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('athleteTrainings_v3_')) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

export const updateUserProfile = async (userData) => {
  try {
    const response = await api.put('/user/edit-profile', userData);
    invalidateProfileCaches();
    return response;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

// Coach-side update for one of their athletes. Mirrors updateUserProfile but
// targets the coach-only endpoint so a coach can adjust an athlete's zones,
// weight, height, etc. from the athlete profile view.
export const updateAthleteProfile = async (athleteId, userData) => {
  try {
    const response = await api.put(`/user/coach/edit-athlete/${athleteId}`, userData);
    invalidateProfileCaches();
    return response;
  } catch (error) {
    console.error('Error updating athlete profile:', error);
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

/** GDPR / data portability: full JSON export for the logged-in user (large payload allowed). */
export const fetchGdprExportJson = async () => {
  const response = await api.get('/user/export-all-data', { timeout: 180000 });
  return response.data;
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

export const getCoachAthletesPage = async (coachId, { limit = 20, offset = 0 } = {}) => {
  try {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    const response = await api.get(`/user/admin/coach-athletes/${coachId}?${params.toString()}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching coach athletes page:', error);
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

export const getAdminHealth = async () => {
  try {
    const response = await api.get('/user/admin/health');
    return response.data;
  } catch (error) {
    console.error('Error fetching admin health:', error);
    throw error;
  }
};

// Send reactivation email with latest lactate test to a specific user (admin only)
export const sendReactivationEmail = async (userId) => {
  try {
    // Must not send JSON `null` as body: express body-parser strict mode only allows {} or [].
    const response = await api.post(`/user/admin/send-reactivation-email/${userId}`, {}, {
      // 400 is often an expected business outcome here (e.g., email notifications OFF).
      suppressErrorLog: true,
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Send thank you email to a specific user (admin only)
export const sendThankYouEmail = async (userId) => {
  try {
    const response = await api.post(`/user/admin/send-thank-you-email/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error sending thank you email:', error);
    throw error;
  }
};

// Send thank you email to all users (admin only)
export const sendThankYouEmailToAll = async () => {
  try {
    const response = await api.post(`/user/admin/send-thank-you-email/all`);
    return response.data;
  } catch (error) {
    console.error('Error sending thank you emails to all users:', error);
    throw error;
  }
};

// Send feature announcement email to a specific user (admin only)
export const sendFeatureAnnouncementEmail = async (userId, emailType = 'newFeatures') => {
  try {
    const response = await api.post(`/user/admin/send-feature-announcement-email/${userId}`, {
      emailType
    });
    return response.data;
  } catch (error) {
    console.error('Error sending feature announcement email:', error);
    throw error;
  }
};

export const sendStravaReminderEmail = async (userId) => {
  try {
    const response = await api.post(`/user/admin/send-strava-reminder-email/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error sending Strava reminder email:', error);
    throw error;
  }
};

// Send custom coach outreach email to arbitrary contact (admin only)
// preview: true → delivers to admin's own email and skips lead tracking
export const sendCoachOutreachEmail = async ({ name, email, subject, body, preview = false }) => {
  try {
    const response = await api.post('/user/admin/send-coach-outreach-email', { name, email, subject, body, preview });
    return response.data;
  } catch (error) {
    console.error('Error sending coach outreach email:', error);
    throw error;
  }
};

export const getCoachOutreachLeads = async () => {
  try {
    const response = await api.get('/user/admin/coach-outreach-leads');
    return response.data;
  } catch (error) {
    console.error('Error fetching coach outreach leads:', error);
    throw error;
  }
};

export const updateCoachOutreachLead = async (leadId, payload) => {
  try {
    const response = await api.patch(`/user/admin/coach-outreach-leads/${leadId}`, payload);
    return response.data;
  } catch (error) {
    console.error('Error updating coach outreach lead:', error);
    throw error;
  }
};

export const importCoachOutreachLeads = async (leads) => {
  try {
    const response = await api.post('/user/admin/coach-outreach-leads/import', { leads });
    return response.data;
  } catch (error) {
    console.error('Error importing coach outreach leads:', error);
    throw error;
  }
};

export const startBulkOutreachCampaign = async (config) => {
  try {
    const response = await api.post('/user/admin/coach-outreach-leads/bulk-campaign', config);
    return response.data;
  } catch (error) {
    console.error('Error starting bulk outreach campaign:', error);
    throw error;
  }
};

export const getBulkCampaignStatus = async (id) => {
  try {
    const response = await api.get(`/user/admin/coach-outreach-leads/bulk-campaign/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error getting bulk campaign status:', error);
    throw error;
  }
};

export const stopBulkCampaign = async (id) => {
  try {
    const response = await api.delete(`/user/admin/coach-outreach-leads/bulk-campaign/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error stopping bulk campaign:', error);
    throw error;
  }
};

export const listBulkCampaigns = async () => {
  try {
    const response = await api.get('/user/admin/coach-outreach-leads/bulk-campaigns');
    return response.data;
  } catch (error) {
    console.error('Error listing bulk campaigns:', error);
    throw error;
  }
};

// Loads the branded default LaChart outreach HTML (~35 KB, with hosted-image
// refs) so the admin can preview, edit, or use as-is before kicking off a
// campaign. See server/email-templates/coachOutreachDefault.html.
export const getDefaultOutreachTemplate = async () => {
  try {
    const response = await api.get('/user/admin/coach-outreach-leads/default-template');
    return response.data; // { html, sizeKB, isFullDocument }
  } catch (error) {
    console.error('Error loading default outreach template:', error);
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

export const deleteUserAdmin = async (userId) => {
  try {
    const response = await api.delete(`/user/admin/users/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
};

// Delete athlete with all tests (for problematic athletes causing freeze)
export const deleteAthleteWithTests = async (athleteId) => {
  try {
    const response = await api.delete(`/user/admin/athlete/${athleteId}/delete-with-tests`);
    // Clear localStorage if response indicates it
    if (response.data?.clearLocalStorage) {
      try {
        localStorage.removeItem('global_selectedAthleteId');
        localStorage.removeItem(`testing_recommendations_open_${athleteId}`);
        localStorage.removeItem(`lachart:lastTestId:${athleteId}`);
      } catch {}
    }
    return response.data;
  } catch (error) {
    console.error('Error deleting athlete with tests:', error);
    throw error;
  }
};

// Zones history – track progression of power & HR zones over time
export const getZoneHistory = async () => {
  try {
    const response = await api.get('/user/zones/history');
    return response.data;
  } catch (error) {
    console.error('Error fetching zone history:', error);
    throw error;
  }
};

// Impersonate a user as admin (login as another user without knowing their password)
// Send a specific retention email to a user for preview/testing (admin only)
export const sendRetentionEmailPreview = async (userId, type) => {
  try {
    const response = await api.post(`/user/admin/send-retention-email/${userId}`, { type });
    return response.data;
  } catch (error) {
    console.error('Error sending retention email preview:', error);
    throw error;
  }
};

export const impersonateUser = async (userId) => {
  try {
    const response = await api.post(`/user/admin/impersonate/${userId}`);
    return response.data; // { token, user }
  } catch (error) {
    console.error('Error impersonating user:', error);
    throw error;
  }
};

// Lactate testing session endpoints
// Lactate Session API
export const createLactateSession = (sessionData) => api.post('/api/lactate-session', sessionData);
export const getLactateSessions = (athleteId) => api.get(`/api/lactate-session/athlete/${athleteId}`);
export const getLactateSessionById = (sessionId) => api.get(`/api/lactate-session/${sessionId}`);
export const updateLactateSession = (sessionId, updateData) => api.put(`/api/lactate-session/${sessionId}`, updateData);
export const completeLactateSession = (sessionId, completionData) =>
  api.post(`/api/lactate-session/${sessionId}/complete`, completionData).then(r => {
    // Invalidate so the calendar picks up the new FitTraining created server-side
    invalidateTrainingCaches();
    return r;
  });
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

// ── Race / goal events (TrainingPeaks-style race planning) ───────────────────
export const getRaceEvents = (athleteId, params = {}) =>
  api.get('/api/race-events', { params: { ...(athleteId ? { athleteId } : {}), ...params } });

export const createRaceEvent = (payload, athleteId) =>
  api.post('/api/race-events', { ...payload, ...(athleteId ? { athleteId } : {}) });

export const updateRaceEvent = (id, payload) =>
  api.put(`/api/race-events/${id}`, payload);

export const deleteRaceEvent = (id) =>
  api.delete(`/api/race-events/${id}`);

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

    // Invalidate training caches so the calendar reflects the new upload immediately
    invalidateTrainingCaches();

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

export const getMonthlyPowerAnalysis = async (athleteId = null, monthKey = null, options = {}) => {
  try {
    const params = {};
    if (athleteId) params.athleteId = String(athleteId);
    if (monthKey)  params.monthKey  = monthKey;
    if (options.startDate) params.startDate = options.startDate instanceof Date ? options.startDate.toISOString() : options.startDate;
    if (options.endDate)   params.endDate   = options.endDate   instanceof Date ? options.endDate.toISOString()   : options.endDate;
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
    // Drop every cached payload that could echo the old value (FIT list,
    // integrations activities, monthly aggregates, etc.) — otherwise a quick
    // reload re-serves the pre-update snapshot.
    invalidateTrainingCaches();
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

// External integrations: Strava & Garmin
// Strava auth-url moved below (with platform support).

export const startGarminAuth = async () => {
  const { data } = await api.get('/api/integrations/garmin/auth-url');
  return data.url;
};

/** Build the Strava OAuth start URL.
 *
 * `platform`: 'ios' makes the server callback redirect to the iOS deep-link
 *   scheme (com.lachart.app://strava-connected) instead of the web frontend.
 *   This is critical inside Capacitor WebView — without it, the OAuth flow
 *   either gets stuck mid-navigation or leaves the user stranded on the
 *   web version of LaChart with no way back to the native app.
 */
export const getStravaAuthUrl = async (opts = {}) => {
  const platform = opts.platform || (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() ? 'ios' : 'web');
  const { data } = await api.get('/api/integrations/strava/auth-url', { params: { platform } });
  return data?.url;
};

/** Admin-only: zero the server's local Strava rate-limit estimator. Used
 *  by the Settings card when the bucket is stuck at MAX from a bad backfill. */
export const resetStravaBudget = async () => {
  const { data } = await api.post('/api/integrations/strava/budget/reset');
  return data; // { ok, before: {...}, after: {...} }
};

export const syncStravaActivities = async (since=null) => {
  // userInitiated: true signals the server this is a manual click, not an
  // auto-sync — the server bypasses its soft rate-limit estimator for the
  // first page so a user click never bounces off our own conservative
  // counter. Strava itself remains the real gatekeeper.
  const { data } = await api.post('/api/integrations/strava/sync', { since, userInitiated: true }, {
    timeout: 600000 // 10 minutes timeout for large syncs (200 pages × 2 seconds = ~6-7 minutes max)
  });
  if (data?.status === 'in_progress') {
    return { imported: 0, updated: 0, status: 'in_progress', message: data?.message || 'Strava sync already in progress' };
  }
  return data; // { imported, updated }
};

// Manually (re)start the full historical import of all Strava activities.
// Runs in the background on the server; progress shows via /strava/status.
export const backfillStravaHistory = async () => {
  const { data } = await api.post('/api/integrations/strava/backfill', {});
  return data; // { started, alreadyRunning? }
};

// Track in-flight auto-sync to prevent multiple simultaneous syncs
let stravaAutoSyncInFlight = false;
let garminAutoSyncInFlight = false;

// GET /strava/status — connection + real-time webhook health
// Returns { connected, autoSync, lastSyncDate, webhookLastEventAt, webhookHealthy }
// ─── "What's new — May 2026" mass email campaign ─────────────────────────────
// Admin-only — backend gates all of these on user.admin === true.
export const fetchWhatsNewMay2026Status = async () => {
  const { data } = await api.get('/api/email/campaigns/whats-new-2026-05/status');
  return data; // { pending, sent, totalEligible }
};

/** Send a single preview email (default: to the admin themselves; override by passing `email`).
 *  Does NOT mark the recipient as sent — the campaign queue is unaffected. */
export const sendWhatsNewMay2026Preview = async ({ email } = {}) => {
  const { data } = await api.post('/api/email/campaigns/whats-new-2026-05/preview', email ? { email } : {});
  return data; // { sent, lang, reason? }
};

/** Run the campaign with explicit pacing. The request blocks until the run
 *  finishes (queue empty OR maxEmailsPerRun reached). Set a generous client
 *  timeout — at the default 1 / 5 min the 20-email cap takes ~100 minutes. */
export const runWhatsNewMay2026Campaign = async ({
  batchSize = 1,
  batchIntervalMs = 5 * 60 * 1000,
  maxEmailsPerRun = 20,
  dryRun = false,
} = {}) => {
  const { data } = await api.post(
    '/api/email/campaigns/whats-new-2026-05/run',
    { batchSize, batchIntervalMs, maxEmailsPerRun, dryRun },
    { timeout: 6 * 60 * 60 * 1000 } // 6h — way more than any sane Zoho-free pace
  );
  return data; // { ok, stats }
};

/** Clear the sent-marker so the campaign can be re-sent (everyone or one email). */
export const resetWhatsNewMay2026 = async ({ email } = {}) => {
  const { data } = await api.post('/api/email/campaigns/whats-new-2026-05/reset', email ? { email } : {});
  return data; // { matched, modified }
};

export const fetchStravaStatus = async () => {
  try {
    const { data } = await api.get('/api/integrations/strava/status', { timeout: 10000 });
    return data;
  } catch (e) {
    console.warn('[strava status] fetch failed:', e?.response?.data || e?.message);
    return null;
  }
};

export const autoSyncStravaActivities = async ({ force = false } = {}) => {
  // Prevent multiple simultaneous syncs
  if (stravaAutoSyncInFlight) {
    console.log('Strava auto-sync already in progress, skipping...');
    return { imported: 0, updated: 0 };
  }

  // Check for 429 errors in recent attempts (prevent rapid retries).
  // The lockout duration is dynamic — we store the unlock timestamp itself
  // (`strava_auto_sync_unlock_at`), derived from the server's Retry-After
  // header. This lets a real Strava 15-min quota reset unlock us in 15 min,
  // but a transient burst unlock in 60s.
  // User-initiated force syncs get a much shorter floor (60 s) since the
  // user is actively waiting and another request won't make anything worse —
  // if Strava is still rate-limited we just bounce off another 429.
  const unlockKey = 'strava_auto_sync_unlock_at';
  const unlockAt = parseInt(localStorage.getItem(unlockKey) || '0', 10);
  const now = Date.now();
  if (unlockAt && now < unlockAt) {
    const minLockoutForForce = 60 * 1000;
    const stillLocked = !force || (unlockAt - now) > minLockoutForForce;
    if (stillLocked) {
      console.log(`Strava auto-sync: Rate-limit lockout active, ${Math.round((unlockAt - now) / 1000)}s left`);
      return { imported: 0, updated: 0, rateLimited: true, retryAfterMs: unlockAt - now };
    }
  }

  stravaAutoSyncInFlight = true;
  try {
    const { data } = await api.post('/api/integrations/strava/auto-sync', { force: !!force }, {
      timeout: 120000 // 2 minutes timeout for auto-sync
    });
    // Clear lockout on success
    localStorage.removeItem(unlockKey);
    // Broadcast that fresh Strava data is on disk so any open Training
    // Calendar / activity-list view refetches without the user having to
    // hard-reload. Always fired (even when imported=0), since the server
    // also marks "updated" rows the calendar should refresh from. Carries
    // the import counts as detail so listeners can show a quick toast.
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('strava:synced', {
          detail: { imported: data?.imported || 0, updated: data?.updated || 0, source: 'manual' },
        }));
      }
    } catch (_) { /* dispatch is best-effort, never block return */ }
    return data; // { imported, updated }
  } catch (error) {
    // Handle 429 (Too Many Requests) gracefully — honour Retry-After when
    // provided. Strava sends seconds; fall back to 5 min if the header is
    // missing (much friendlier than the previous 15-min wall).
    if (error.response?.status === 429) {
      const retryAfterSec = Number(
        error.response.headers?.['retry-after'] ||
        error.response.data?.retryAfter ||
        300
      );
      const lockoutMs = Math.min(Math.max(retryAfterSec, 60), 15 * 60) * 1000;
      const unlockTs = now + lockoutMs;
      console.log(`Strava auto-sync: Rate limited (429), unlock in ${Math.round(lockoutMs / 1000)}s`);
      localStorage.setItem(unlockKey, String(unlockTs));
      return { imported: 0, updated: 0, rateLimited: true, retryAfterMs: lockoutMs };
    }
    // Silently fail for other errors - don't show errors to user
    console.log('Auto-sync failed:', error);
    return { imported: 0, updated: 0 };
  } finally {
    stravaAutoSyncInFlight = false;
  }
};

// Connect Garmin via username + password (garmin-connect library, no partner approval needed)
export const connectGarminCredentials = async (username, password) => {
  const { data } = await api.post('/api/integrations/garmin/login', { username, password });
  return data;
};

export const syncGarminActivities = async (since=null) => {
  const { data } = await api.post('/api/integrations/garmin/sync', { since }, {
    timeout: 600000 // 10 minutes timeout for large syncs
  });
  return data; // { imported, updated }
};

// Full history import — paginates 5 years in 90-day chunks on the server
export const syncGarminHistory = async () => {
  const { data } = await api.post('/api/integrations/garmin/sync-history', {}, {
    timeout: 1800000 // 30 minutes — full history can be large
  });
  return data;
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
  if (last429 && (now - parseInt(last429)) < 15 * 60 * 1000) { // Wait 15 min after 429
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

/**
 * @param {Record<string, unknown>} [params] query params
 * @param {{ signal?: AbortSignal; timeout?: number }} [requestOpts] large activity lists may need timeout above default 60s
 */
export const listExternalActivities = async (params = {}, requestOpts = {}) => {
  const { signal, timeout } = requestOpts;
  const cfg = { params };
  if (signal) cfg.signal = signal;
  if (timeout != null) cfg.timeout = timeout;
  const { data } = await api.get('/api/integrations/activities', cfg);
  return data; // normalized activities
};

/** @param {{ signal?: AbortSignal; timeout?: number }} [opts] */
export const getIntegrationStatus = async (opts = {}) => {
  const { signal, timeout, athleteId } = opts;
  const cfg = {};
  if (signal) cfg.signal = signal;
  if (timeout != null) cfg.timeout = timeout;
  if (athleteId) cfg.params = { athleteId };
  const { data } = await api.get('/api/integrations/status', cfg);
  return data; // { stravaConnected, garminConnected, appleHealthConnected, ... }
};

export const syncAppleHealth = async (payload) => {
  const { data } = await api.post('/api/integrations/apple-health/sync', payload);
  return data;
};

export const syncAppleHealthWellness = async (payload) => {
  const { data } = await api.post('/api/integrations/apple-health/wellness-sync', payload);
  return data;
};

/** @param {{ days?: number; signal?: AbortSignal }} [opts] */
export const getAppleHealthWellness = async (opts = {}) => {
  const cfg = { params: {} };
  if (opts.days != null) cfg.params.days = opts.days;
  if (opts.signal) cfg.signal = opts.signal;
  const { data } = await api.get('/api/integrations/apple-health/wellness', cfg);
  return data;
};

export const getAppleHealthStatus = async () => {
  const { data } = await api.get('/api/integrations/apple-health/status');
  return data;
};

export const disconnectAppleHealth = async () => {
  const { data } = await api.delete('/api/integrations/apple-health');
  return data;
};

/**
 * Strava activities (recent) missing field lactate on at least one lap, or with no laps loaded yet.
 * @param {string | null} [athleteId] coach viewing athlete
 * @param {{ days?: number; signal?: AbortSignal }} [opts]
 */
export const getPendingLactateActivities = async (athleteId = null, opts = {}) => {
  const params = {};
  if (athleteId) params.athleteId = athleteId;
  if (opts.days != null) params.days = opts.days;
  const cfg = { params };
  if (opts.signal) cfg.signal = opts.signal;
  const { data } = await api.get('/api/integrations/strava/pending-lactate', cfg);
  return data; // { activities: [...], days }
};

/**
 * Sync Strava activity to Training and return payload for TrainingForm (field lactate from list).
 * @param {string} stravaActivityId Mongo _id of StravaActivity
 * @param {string | null} [athleteId] coach viewing athlete
 */
export const fetchTrainingForStravaLactateForm = async (stravaActivityId, athleteId = null) => {
  const params = {};
  if (athleteId) params.athleteId = athleteId;
  const { data } = await api.post(
    '/api/integrations/strava/training-for-lactate-form',
    { stravaActivityId },
    { params }
  );
  return data; // { training }
};

export const updateAvatarFromStrava = async () => {
  const { data } = await api.post('/api/integrations/strava/update-avatar');
  return data; // { success, avatar, message }
};

/** Route param for /strava/activities/:id — 24-char Mongo _id or numeric Strava id. Calendar/UI often uses `strava-<id>`. */
export const normalizeStravaActivityRouteId = (id) => {
  if (id == null || id === '') return id;
  const s = String(id).trim();
  if (/^[a-f0-9]{24}$/i.test(s)) return s;
  const stripped = s.replace(/^strava-/i, '');
  if (/^\d+$/.test(stripped)) return stripped;
  const n = parseInt(stripped, 10);
  return Number.isFinite(n) && n >= 1 ? String(n) : stripped;
};

export const getStravaActivityDetail = async (stravaId, athleteId = null, forceRefresh = false) => {
  const params = athleteId ? { athleteId } : {};
  if (forceRefresh) params.refresh = '1';
  const id = normalizeStravaActivityRouteId(stravaId);
  const { data } = await api.get(`/api/integrations/strava/activities/${encodeURIComponent(id)}`, { params });
  return data; // { detail, streams, laps, titleManual, description }
};

/**
 * Delete an imported Strava activity from LaChart.
 *
 * Removes our local StravaActivity document + cached streams; does NOT
 * touch the activity on the user's Strava account (we have no permission
 * to delete from Strava itself, and the user can still re-import via a
 * fresh sync if they change their mind).
 *
 * Coach can delete an athlete's activity by passing athleteId — server
 * verifies the coach-athlete link.
 */
export const deleteStravaActivity = async (stravaId, athleteId = null) => {
  const params = athleteId ? { athleteId } : {};
  const id = normalizeStravaActivityRouteId(stravaId);
  const { data } = await api.delete(
    `/api/integrations/strava/activities/${encodeURIComponent(id)}`,
    { params },
  );
  return data; // { ok: true, deleted: { activity, streams } }
};

export const updateStravaActivity = async (stravaId, { title, description, category }) => {
  try {
    const id = normalizeStravaActivityRouteId(stravaId);
    const response = await api.put(`/api/integrations/strava/activities/${encodeURIComponent(id)}`, {
      title,
      description,
      category
    });
    // The integrations/activities list is heavily cached (120s TTL +
    // localStorage). Without this, the page reloads after a category edit
    // re-serve the stale entry and the user thinks the save failed.
    invalidateTrainingCaches();
    return response.data;
  } catch (error) {
    console.error('Error updating Strava activity:', error);
    throw error;
  }
};

export const updateStravaLactateValues = async (stravaId, lactateValues) => {
  try {
    const id = normalizeStravaActivityRouteId(stravaId);
    const response = await api.put(`/api/integrations/strava/activities/${encodeURIComponent(id)}/lactate`, {
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
    const id = normalizeStravaActivityRouteId(stravaId);
    const response = await api.post(`/api/integrations/strava/activities/${encodeURIComponent(id)}/laps`, {
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
    const id = normalizeStravaActivityRouteId(stravaId);
    const response = await api.post(`/api/integrations/strava/activities/${encodeURIComponent(id)}/laps/bulk`, {
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
    const id = normalizeStravaActivityRouteId(stravaId);
    const response = await api.delete(`/api/integrations/strava/activities/${encodeURIComponent(id)}/laps/${lapIndex}`);
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

export const getSimilarWorkouts = async (workoutId, threshold = 0.65) => {
  const { data } = await api.get(`/api/workout-clustering/similar/${workoutId}`, { params: { threshold } });
  return data;
};

export const getClusterTrend = async (clusterId) => {
  const { data } = await api.get(`/api/workout-clustering/cluster/${clusterId}/trend`);
  return data;
};

// ===== SUBSCRIPTION / BILLING =====

/** Fetch all available plans (no auth required) */
export const getSubscriptionPlans = async () => {
  const { data } = await api.get('/api/subscription/plans');
  return data; // { plans: [...] }
};

/** Fetch current user's subscription status */
export const getCurrentSubscription = async () => {
  const { data } = await api.get('/api/subscription/current');
  return data; // { subscription, isPremium, premiumSource }
};

/** Create a Stripe checkout session and redirect */
export const createCheckoutSession = async (planId) => {
  const successUrl = `${window.location.origin}/settings?tab=subscription&success=1`;
  const cancelUrl = `${window.location.origin}/settings?tab=subscription&canceled=1`;
  const { data } = await api.post('/api/subscription/create-checkout-session', {
    planId,
    successUrl,
    cancelUrl,
  });
  return data; // { sessionId, url }
};

/** Get Stripe customer portal URL */
export const getSubscriptionPortalUrl = async () => {
  const { data } = await api.get('/api/subscription/portal');
  return data; // { url }
};

/** Cancel subscription at period end */
export const cancelSubscription = async () => {
  const { data } = await api.post('/api/subscription/cancel');
  return data;
};

/**
 * Force-sync subscription state from Stripe → MongoDB.
 * Webhook-failure fallback. Safe to call repeatedly.
 * Returns { synced, subscription? }.
 */
export const syncSubscriptionFromStripe = async () => {
  const { data } = await api.post('/api/subscription/sync');
  return data;
};

/**
 * Fetch the latest user profile (bypasses local cache).
 * Used after subscription sync so isPremium flips on immediately.
 */
export const fetchUserProfile = async () => {
  invalidateCache('/user/profile');
  const { data } = await api.get('/user/profile');
  return data;
};

/** Reactivate a canceled subscription */
export const reactivateSubscription = async () => {
  const { data } = await api.post('/api/subscription/reactivate');
  return data;
};

// Training Comments
export const getTrainingComments = (trainingId) => api.get(`/api/comments/training/${trainingId}`);
export const addTrainingComment = (trainingId, text, trainingType = 'training') => api.post(`/api/comments/training/${trainingId}`, { text, trainingType });
export const deleteTrainingComment = (commentId) => api.delete(`/api/comments/training-comment/${commentId}`);
export const getTrainingCommentCounts = (ids) => api.get(`/api/comments/training/counts?ids=${ids.join(',')}`);

// In-app Notifications
export const getNotifications = () => api.get('/api/notifications');
export const markAllNotificationsRead = () => api.patch('/api/notifications/read');
export const markNotificationRead = (id) => api.patch(`/api/notifications/${id}/read`);
export const deleteNotification = (id) => api.delete(`/api/notifications/${id}`);
export const clearAllNotifications = () => api.delete('/api/notifications');

// Mobile push token registration (Capacitor / Expo)
export const registerPushToken = (expoPushToken) =>
  api.post('/user/push-token', { expoPushToken });
// Field Lactate Measurements
export const createFieldLactateMeasurement = (data) => api.post('/api/field-lactate', data).then(r => r.data);
export const getFieldLactateMeasurements = (athleteId = null, status = null) => {
  const params = {};
  if (athleteId) params.athleteId = athleteId;
  if (status) params.status = status;
  return api.get('/api/field-lactate', { params }).then(r => r.data);
};
export const deleteFieldLactateMeasurement = (id) => api.delete(`/api/field-lactate/${id}`).then(r => r.data);
export const assignFieldLactateMeasurement = (id, assignment) => api.put(`/api/field-lactate/${id}/assign`, assignment).then(r => r.data);

// Similar activities (for Compare tab in ActivityFullModal)
export const getSimilarActivities = async ({ title, category, sport, lactate, excludeId, athleteId, limit = 30 } = {}) => {
  const params = {};
  if (title)     params.title = title;
  if (category)  params.category = category;
  if (sport)     params.sport = sport;
  if (lactate != null) params.lactate = lactate;
  if (excludeId) params.excludeId = excludeId;
  if (athleteId) params.athleteId = athleteId;
  params.limit = limit;
  const { data } = await api.get('/api/integrations/activities/similar', { params });
  return data; // array
};
