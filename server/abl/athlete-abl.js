// athleteABL.js
const athleteDAO = require('../dao/athlete-dao');

async function createAthlete(req, res) {
  try {
    const userId = req.user.id; // Assuming req.user is set by your auth middleware
    const athleteData = { ...req.body, userId };
    const athlete = await athleteDAO.create(athleteData);
    res.status(201).json(athlete);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

async function listAthletes(req, res) {
  try {
    const athletes = await athleteDAO.findAll();
    res.json(athletes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function getAthleteById(req, res) {
  try {
    const athlete = await athleteDAO.findById(req.params.id);
    if (!athlete) {
      return res.status(404).json({ message: 'Athlete not found' });
    }
    res.json(athlete);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function updateAthlete(req, res) {
  try {
    const update = req.body;
    const updatedAthlete = await athleteDAO.update(req.params.id, update);
    if (!updatedAthlete) {
      return res.status(404).json({ message: 'Athlete not found' });
    }
    res.json(updatedAthlete);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function listAthletesByUser(req, res) {
  try {
    const athletes = await athleteDAO.findByUserId(req.params.userId);
    res.json(athletes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createAthlete,
  listAthletes,
  getAthleteById,
  updateAthlete,
  listAthletesByUser
};
