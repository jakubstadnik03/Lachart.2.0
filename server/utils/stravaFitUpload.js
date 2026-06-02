'use strict';

const axios = require('axios');
const { getValidStravaToken } = require('./stravaToken');

/**
 * Upload a .fit buffer to Strava (POST /api/v3/uploads).
 * Returns { uploadId, activityId, status }.
 */
async function uploadFitToStrava(user, fitBuffer, { name, description } = {}) {
  const token = await getValidStravaToken(user);
  if (!token) {
    const err = new Error('Strava is not connected');
    err.code = 'STRAVA_NOT_CONNECTED';
    throw err;
  }

  const fd = new FormData();
  fd.append('file', new Blob([fitBuffer], { type: 'application/vnd.ant.fit' }), 'lachart-workout.fit');
  fd.append('data_type', 'fit');
  if (name) fd.append('name', String(name).slice(0, 80));
  if (description) fd.append('description', String(description).slice(0, 255));

  const uploadResp = await fetch('https://www.strava.com/api/v3/uploads', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });

  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    throw new Error(`Strava upload failed (${uploadResp.status}): ${text.slice(0, 200)}`);
  }

  const upload = await uploadResp.json();
  const uploadId = upload.id;

  let activityId = upload.activity_id || null;
  const deadline = Date.now() + 45000;
  while (!activityId && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusResp = await axios.get(`https://www.strava.com/api/v3/uploads/${uploadId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (statusResp.data?.activity_id) {
      activityId = statusResp.data.activity_id;
      break;
    }
    if (statusResp.data?.error) {
      throw new Error(statusResp.data.error);
    }
  }

  return {
    uploadId,
    activityId,
    status: activityId ? 'ready' : 'processing',
  };
}

module.exports = { uploadFitToStrava };
