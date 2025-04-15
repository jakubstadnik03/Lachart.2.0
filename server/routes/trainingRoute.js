// routes/testingRoutes.js
const express = require("express");
const router = express.Router();
const TrainingAbl = require("../abl/trainingAbl");
const verifyToken = require("../middleware/verifyToken");

// Create a new training
router.post("/", verifyToken, async (req, res) => {
  try {
    if (typeof req.body === 'string') {
      req.body = JSON.parse(req.body);
    }

    // Validace povinných polí
    const requiredFields = ['athleteId', 'sport', 'title', 'date'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Chybí povinná pole: ${missingFields.join(', ')}`
      });
    }

    // Validace specifics objektu
    if (req.body.specifics) {
      if (typeof req.body.specifics !== 'object') {
        return res.status(400).json({
          error: 'Specifics musí být objekt'
        });
      }
    }

    // Formátování data
    if (req.body.date) {
      req.body.date = new Date(req.body.date);
    }

    // Validace formátu results
    if (req.body.results) {
      req.body.results = req.body.results.map(result => ({
        interval: Number(result.interval),
        power: Number(result.power),
        heartRate: Number(result.heartRate),
        lactate: Number(result.lactate),
        glucose: Number(result.glucose),
        RPE: Number(result.RPE)
      }));
    }

    console.log('Processed training data:', JSON.stringify(req.body, null, 2));
    const newTraining = await TrainingAbl.createTraining(req.body);
    res.status(201).json(newTraining);
  } catch (error) {
    console.error('Error creating training:', error);
    res.status(400).json({ 
      error: 'Neplatný formát dat',
      details: error.message 
    });
  }
});

// Get all trainings for an athlete
router.get("/athlete/:athleteId", verifyToken, async (req, res) => {
  try {
    const trainings = await TrainingAbl.getTrainingsByAthlete(req.params.athleteId);
    res.status(200).json(trainings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all training titles
router.get("/titles", verifyToken, async (req, res) => {
  try {
    console.log('User from token:', req.user);
    if (!req.user || !req.user.userId) {
      console.error('No user ID found in token');
      return res.status(401).json({ error: 'No user ID found in token' });
    }
    const titles = await TrainingAbl.getTrainingTitles(req.user.userId);
    res.status(200).json(titles);
  } catch (error) {
    console.error('Error in /training/titles:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
});

// Get trainings by title
router.get("/title/:title", verifyToken, async (req, res) => {
  try {
    const decodedTitle = decodeURIComponent(req.params.title);
    const trainings = await TrainingAbl.getTrainingsByTitle(decodedTitle, req.user.userId);
    res.status(200).json(trainings);
  } catch (error) {
    console.error('Error in /training/title:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific training by ID
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const training = await TrainingAbl.getTrainingById(req.params.id);
    if (!training) {
      return res.status(404).json({ error: "Trénink nenalezen" });
    }
    res.status(200).json(training);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a training
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const updatedTraining = await TrainingAbl.updateTraining(req.params.id, req.body);
    if (!updatedTraining) {
      return res.status(404).json({ error: "Trénink nenalezen" });
    }
    res.status(200).json(updatedTraining);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a training
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const deletedTraining = await TrainingAbl.deleteTraining(req.params.id);
    if (!deletedTraining) {
      return res.status(404).json({ error: "Trénink nenalezen" });
    }
    res.status(200).json({ message: "Trénink smazán" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
