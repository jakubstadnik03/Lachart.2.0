import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api.config';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

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

export const getAllTrainings = () => api.get('/training');
export const getTrainingById = (id) => api.get(`/training/${id}`);
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

export default api; 