// export const API_BASE_URL = 'https://lachart.onrender.com';
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
    // Nové endpointy pro správu trenéra
    COACH_PROFILE: `${API_BASE_URL}/user/coach/profile`,
    REMOVE_COACH: `${API_BASE_URL}/user/athlete/remove-coach`,
    INVITE_COACH: `${API_BASE_URL}/user/athlete/invite-coach`,
    // Nové endpointy
    TRAININGS: (athleteId) => `${API_BASE_URL}/user/athlete/${athleteId}/trainings`,
    TRAINING_DETAIL: (id) => `${API_BASE_URL}/trainings/${id}`,
    CREATE_TRAINING: `${API_BASE_URL}/trainings/create`,
    UPDATE_TRAINING: (id) => `${API_BASE_URL}/trainings/${id}`,
    DELETE_TRAINING: (id) => `${API_BASE_URL}/trainings/${id}`,
    GET_TRAININGS_BY_TITLE: (title) => `${API_BASE_URL}/training/title/${encodeURIComponent(title)}`,
    
    TESTINGS: `${API_BASE_URL}/testings`,
    TESTING_DETAIL: (id) => `${API_BASE_URL}/testings/${id}`,
    CREATE_TESTING: `${API_BASE_URL}/testings/create`,
    UPDATE_TESTING: (id) => `${API_BASE_URL}/testings/${id}`,
    DELETE_TESTING: (id) => `${API_BASE_URL}/testings/${id}`,
    AUTH: `${API_BASE_URL}/user`,
    ATHLETES: `${API_BASE_URL}/athletes`,
    PROFILE: `${API_BASE_URL}/user/profile`,
    ATHLETE_DETAIL: (id) => `${API_BASE_URL}/user/athlete/${id}`,
    ATHLETE_TRAININGS: (id) => `${API_BASE_URL}/user/athlete/${id}/trainings`,
    ATHLETE_TESTS: (id) => `${API_BASE_URL}/test/list/${id}`,
    ADD_TRAINING: `${API_BASE_URL}/user/training`,
    ATHLETE: (id) => `${API_BASE_URL}/user/athlete/${id}`,
    VERIFY_COACH_INVITATION: (token) => `${API_BASE_URL}/user/verify-coach-invitation-token/${token}`,
    ACCEPT_COACH_INVITATION: (token) => `${API_BASE_URL}/user/accept-coach-invitation/${token}`,
    // Add USER and CHANGE_PASSWORD endpoints
    USER: `${API_BASE_URL}/user`,
    CHANGE_PASSWORD: `${API_BASE_URL}/user/change-password`,
    // další endpointy...
}; 