// abl/TrainingAbl.js
const TrainingDao = require('../dao/trainingDao');
const UserDao = require('../dao/userDao');

class TrainingAbl {
    constructor() {
        this.trainingDao = new TrainingDao();
        this.userDao = new UserDao();
    }

    async createTraining(trainingData) {
        try {
            // Validace existence atleta
            const athlete = await this.userDao.findById(trainingData.athleteId);
            if (!athlete) {
                throw new Error('Atlet s tímto ID neexistuje');
            }

            // Validace existence trenéra, pokud je zadán
            if (trainingData.coachId) {
                const coach = await this.userDao.findById(trainingData.coachId);
                if (!coach) {
                    throw new Error('Trenér s tímto ID neexistuje');
                }
            }

            return await this.trainingDao.createTraining(trainingData);
        } catch (error) {
            console.error('Error in createTraining:', error);
            throw error;
        }
    }

    async getTrainingsByAthlete(athleteId) {
        return await this.trainingDao.findByAthleteId(athleteId);
    }

    async getTrainingById(id) {
        return await this.trainingDao.findById(id);
    }

    async updateTraining(id, updateData) {
        return await this.trainingDao.update(id, updateData);
    }

    async deleteTraining(id) {
        return await this.trainingDao.delete(id);
    }
}

module.exports = new TrainingAbl();
