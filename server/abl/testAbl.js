// abl/measurementABL.js
const UserDao = require("../dao/userDao");
const TestDao = require("../dao/testDao");
const Test = require('../models/test');

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

    static async getTestsByAthleteId(athleteId) {
        try {
            const tests = await Test.find({ athleteId: athleteId });
            return tests;
        } catch (error) {
            throw {
                status: 500,
                error: `Chyba při získávání testů: ${error.message}`
            };
        }
    }

    static async createTest(testData) {
        try {
            const test = new Test(testData);
            return await test.save();
        } catch (error) {
            throw {
                status: 400,
                error: `Chyba při vytváření testu: ${error.message}`
            };
        }
    }

    static async getTestById(id) {
        try {
            const test = await Test.findById(id);
            if (!test) {
                throw {
                    status: 404,
                    error: 'Test nenalezen'
                };
            }
            return test;
        } catch (error) {
            throw {
                status: error.status || 500,
                error: error.error || `Chyba při získávání testu: ${error.message}`
            };
        }
    }

    static async updateTest(id, testData) {
        try {
            const test = await Test.findByIdAndUpdate(id, testData, { 
                new: true,
                runValidators: true 
            });
            if (!test) {
                throw {
                    status: 404,
                    error: 'Test nenalezen'
                };
            }
            return test;
        } catch (error) {
            throw {
                status: error.status || 500,
                error: error.error || `Chyba při aktualizaci testu: ${error.message}`
            };
        }
    }

    static async deleteTest(id) {
        try {
            const test = await Test.findByIdAndDelete(id);
            if (!test) {
                throw {
                    status: 404,
                    error: 'Test nenalezen'
                };
            }
            return test;
        } catch (error) {
            throw {
                status: error.status || 500,
                error: error.error || `Chyba při mazání testu: ${error.message}`
            };
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

    async updateTest(id, updateData) {
        return await this.testDao.updateTest(id, updateData);
    }

    async deleteTest(id) {
        return await this.testDao.deleteTest(id);
    }
}

module.exports = TestAbl;
