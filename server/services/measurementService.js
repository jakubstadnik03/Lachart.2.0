const Measurement = require('../models/test');

async function createMeasurement(data) {
  const measurement = new Measurement(data);
  return measurement.save();
}

async function getMeasurementsByAthleteId(athleteId) {
  return Measurement.find({ athleteId });
}

// More services like updateMeasurement, deleteMeasurement, etc.

module.exports = {
  createMeasurement,
  getMeasurementsByAthleteId,
  // Export other functions as needed
};
