const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const USE_MOCK = process.env.REACT_APP_USE_MOCK === 'true';

import { fetchMockTrainings } from '../mock/mockApi';

export const api = {
  // Auth
  async login(email, password) {
    if (USE_MOCK) {
      return { token: 'mock-token', user: { id: '1', email, name: 'Mock User' } };
    }
    
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return await response.json();
  },

  // Trainings
  async getTrainings() {
    if (USE_MOCK) {
      return await fetchMockTrainings();
    }

    const response = await fetch(`${API_URL}/training`, {
      headers: {
        'x-auth-token': localStorage.getItem('token')
      }
    });
    return await response.json();
  },

  async addTraining(trainingData) {
    if (USE_MOCK) {
      return trainingData;
    }

    const response = await fetch(`${API_URL}/training`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(trainingData)
    });
    return await response.json();
  }
}; 