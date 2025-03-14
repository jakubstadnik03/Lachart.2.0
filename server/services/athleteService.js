const Athlete = require('../models/athlete');

async function createAthlete(data) {
  const athlete = new Athlete(data);
  return athlete.save();
}

async function getAllAthletes() {
  return Athlete.find();
}


module.exports = {
  createAthlete,
  getAllAthletes,
  // Export other functions as needed
};
