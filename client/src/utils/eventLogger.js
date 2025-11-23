// Event logging utility for client-side
import { API_BASE_URL } from '../config/api.config';

export const logEvent = async (type, metadata = {}, userId = null) => {
  try {
    const eventData = {
      type,
      userId,
      metadata,
      timestamp: new Date().toISOString(),
      sessionId: getSessionId(),
      userAgent: navigator.userAgent
    };

    // Send to backend
    const response = await fetch(`${API_BASE_URL}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData)
    });

    if (!response.ok) {
      console.warn('Failed to log event:', type, response.status);
    } else {
      console.log('📊 Event logged:', type, metadata);
    }
  } catch (error) {
    console.warn('Event logging failed:', error);
    // Don't throw - event logging should never break the app
  }
};

// Generate or retrieve session ID
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('lachart_session_id');
  if (!sessionId) {
    sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem('lachart_session_id', sessionId);
  }
  return sessionId;
};

// Predefined event logging functions
export const logUserRegistration = (method = 'email', userId = null) => {
  return logEvent('register', { method }, userId);
};

export const logUserLogin = (method = 'email', userId = null) => {
  return logEvent('login', { method }, userId);
};

export const logTestCreated = (sport, intervals, userId = null) => {
  return logEvent('test_created', { sport, intervals }, userId);
};

export const logTestCompleted = (sport, thresholds, userId = null) => {
  return logEvent('test_completed', { sport, thresholds }, userId);
};

export const logFeedbackSent = (subject, userId = null) => {
  return logEvent('feedback_sent', { subject }, userId);
};

export const logDemoUsed = (feature, userId = null) => {
  return logEvent('demo_used', { feature }, userId);
};

export const logGuideViewed = (section, userId = null) => {
  return logEvent('guide_viewed', { section }, userId);
};

// Analytics helper
export const getEventStats = async (type = null, startDate = null, endDate = null) => {
  try {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const response = await fetch(`${API_BASE_URL}/api/events/stats?${params}`);
    const data = await response.json();
    
    if (data.success) {
      return data.stats;
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Failed to fetch event stats:', error);
    return null;
  }
};
