// abl/measurementABL.js
const UserDao = require("../dao/userDao");
const TestDao = require("../dao/testDao");

async function createMeasurement(measurementData) {
  return measurementDAO.createMeasurement(measurementData);
}

async function getMeasurementsByAthleteId(athleteId) {
  return measurementDAO.getMeasurementsByAthleteId(athleteId);
}

async function getMeasurementById(id) {
  return measurementDAO.getMeasurementById(id);
}

async function updateMeasurement(id, updateData) {
  return measurementDAO.updateMeasurement(id, updateData);
}
async function deleteMeasurement(id) {
  return measurementDAO.deleteMeasurement(id);
}

class TestAbl {
    constructor() {
        this.testDao = new TestDao();
        this.userDao = new UserDao();
    }

    async createTest(req, res) {
        try {
            const { athleteId, coachId, date, type, description, results } = req.body;

            // Validace existence atleta
            const athlete = await this.userDao.findById(athleteId);
            if (!athlete) {
                return res.status(404).json({ error: "Atlet nenalezen" });
            }

            // Validace existence trenéra
            const coach = await this.userDao.findById(coachId);
            if (!coach) {
                return res.status(404).json({ error: "Trenér nenalezen" });
            }

            const testData = {
                athleteId,
                coachId,
                date,
                type,
                description,
                results
            };

            const newTest = await this.testDao.createTest(testData);
            res.status(201).json(newTest);
        } catch (error) {
            console.error("Error in createTest:", error);
            res.status(500).json({ error: error.message });
        }
    }

    async getTestsByAthleteId(athleteId) {
        try {
            // Kontrola existence atleta
            const athlete = await this.userDao.findById(athleteId);
            if (!athlete) {
                throw {
                    status: 404,
                    error: 'Atlet s tímto ID neexistuje'
                };
            }

            return await this.testDao.getTestsByAthleteId(athleteId);
        } catch (error) {
            throw {
                status: error.status || 500,
                error: error.error || 'Chyba při získávání testů'
            };
        }
    }

    async getTestById(id) {
        return await this.testDao.getTestById(id);
    }

    async updateTest(id, updateData) {
        return await this.testDao.updateTest(id, updateData);
    }

    async deleteTest(id) {
        return await this.testDao.deleteTest(id);
    }
}

module.exports = new TestAbl();
