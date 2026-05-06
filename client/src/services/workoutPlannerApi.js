/**
 * Workout Planner API helpers
 */
import api from './api';

const BASE = '/api/workout-planner';

// ── Templates ──────────────────────────────────────────────────────────────

export const getWorkoutTemplates = async (sport) => {
  const params = sport ? { sport } : {};
  const { data } = await api.get(`${BASE}/templates`, { params });
  return data;
};

export const getWorkoutTemplate = async (id) => {
  const { data } = await api.get(`${BASE}/templates/${id}`);
  return data;
};

export const createWorkoutTemplate = async (payload) => {
  const { data } = await api.post(`${BASE}/templates`, payload);
  return data;
};

export const updateWorkoutTemplate = async (id, payload) => {
  const { data } = await api.put(`${BASE}/templates/${id}`, payload);
  return data;
};

export const deleteWorkoutTemplate = async (id) => {
  const { data } = await api.delete(`${BASE}/templates/${id}`);
  return data;
};

// ── Planned Workouts ───────────────────────────────────────────────────────

/**
 * @param {{ from?: string, to?: string, athleteId?: string }} opts
 */
export const getPlannedWorkouts = async (opts = {}) => {
  const { data } = await api.get(`${BASE}/planned`, { params: opts });
  return data;
};

export const getPlannedWorkout = async (id) => {
  const { data } = await api.get(`${BASE}/planned/${id}`);
  return data;
};

export const createPlannedWorkout = async (payload, athleteId = null) => {
  const params = athleteId ? { athleteId } : {};
  const { data } = await api.post(`${BASE}/planned`, payload, { params });
  return data;
};

export const updatePlannedWorkout = async (id, payload, athleteId = null) => {
  const params = athleteId ? { athleteId } : {};
  const { data } = await api.put(`${BASE}/planned/${id}`, payload, { params });
  return data;
};

export const deletePlannedWorkout = async (id, athleteId = null) => {
  const params = athleteId ? { athleteId } : {};
  const { data } = await api.delete(`${BASE}/planned/${id}`, { params });
  return data;
};
