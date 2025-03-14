export const API_BASE_URL = 'http://localhost:8000';

export const API_ENDPOINTS = {
    LOGIN: `${API_BASE_URL}/user/login`,
    LOGOUT: `${API_BASE_URL}/user/logout`,
    REGISTER: `${API_BASE_URL}/user/register`,
    VERIFY_TOKEN: `${API_BASE_URL}/user/verify-token`,
    COACH_ATHLETES: `${API_BASE_URL}/user/coach/athletes`,
    ATHLETE_PROFILE: (id) => `${API_BASE_URL}/user/athlete/${id}`,
    USER_PROFILE: `${API_BASE_URL}/user/profile`,
    EDIT_PROFILE: `${API_BASE_URL}/user/edit-profile`,
    COACH_EDIT_ATHLETE: (id) => `${API_BASE_URL}/user/coach/edit-athlete/${id}`,
    // Nové endpointy
    TRAININGS: `${API_BASE_URL}/trainings`,
    TRAINING_DETAIL: (id) => `${API_BASE_URL}/trainings/${id}`,
    CREATE_TRAINING: `${API_BASE_URL}/trainings/create`,
    UPDATE_TRAINING: (id) => `${API_BASE_URL}/trainings/${id}`,
    DELETE_TRAINING: (id) => `${API_BASE_URL}/trainings/${id}`,
    
    TESTINGS: `${API_BASE_URL}/testings`,
    TESTING_DETAIL: (id) => `${API_BASE_URL}/testings/${id}`,
    CREATE_TESTING: `${API_BASE_URL}/testings/create`,
    UPDATE_TESTING: (id) => `${API_BASE_URL}/testings/${id}`,
    DELETE_TESTING: (id) => `${API_BASE_URL}/testings/${id}`,
    // další endpointy...
}; 