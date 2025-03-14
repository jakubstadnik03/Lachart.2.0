// dao/measurementDAO.js
const Test = require("../models/test");

class TestDao {
    async createTest(testData) {
        try {
            const test = new Test(testData);
            return await test.save();
        } catch (error) {
            throw error;
        }
    }

    async getTestsByAthleteId(athleteId) {
        try {
            return await Test.find({ athleteId });
        } catch (error) {
            throw error;
        }
    }

    async getTestById(id) {
        try {
            return await Test.findById(id);
        } catch (error) {
            throw error;
        }
    }

    async updateTest(id, updateData) {
        try {
            return await Test.findByIdAndUpdate(id, updateData, { 
                new: true,
                runValidators: true 
            });
        } catch (error) {
            throw error;
        }
    }

    async deleteTest(id) {
        try {
            return await Test.findByIdAndDelete(id);
        } catch (error) {
            throw error;
        }
    }
}

module.exports = TestDao;
