import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api.config';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Auth endpoints
export const login = async (credentials) => {
  try {
    const response = await api.post('/user/login', credentials, {
      headers: {
        'Content-Type': 'application/json',
      }
    });
    console.log('Login response:', response);
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

export const getTestingsByAthleteId = async (athleteId) => {
  try {
    const response = await api.get(API_ENDPOINTS.ATHLETE_TESTS(athleteId));
    console.log('Tests response:', response.data); // Pro debug
    return response.data;
  } catch (error) {
    console.error('Error fetching athlete tests:', error);
    throw error;
  }
};

// Přidáme interceptor pro přidání tokenu do každého requestu
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor pro zpracování chyb
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
    }
    return Promise.reject(error);
  }
);

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

export const updateFitTraining = async (trainingId, { title, description, selectedLapIndices }) => {
  try {
    const response = await api.put(`/api/fit/trainings/${trainingId}`, {
      title,
      description,
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

export const syncGarminActivities = async (since=null) => {
  const { data } = await api.post('/api/integrations/garmin/sync', { since });
  return data;
};

export const listExternalActivities = async (params={}) => {
  const { data } = await api.get('/api/integrations/activities', { params });
  return data; // normalized activities
};

export const getIntegrationStatus = async () => {
  const { data } = await api.get('/api/integrations/status');
  return data; // { stravaConnected, garminConnected }
};

export const getStravaActivityDetail = async (stravaId) => {
  const { data } = await api.get(`/api/integrations/strava/activities/${stravaId}`);
  return data; // { detail, streams, laps, titleManual, description }
};

export const updateStravaActivity = async (stravaId, { title, description }) => {
  try {
    const response = await api.put(`/api/integrations/strava/activities/${stravaId}`, {
      title,
      description
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