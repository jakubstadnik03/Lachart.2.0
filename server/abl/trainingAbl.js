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

    async getTrainingTitles(userId) {
        try {
            console.log('Getting training titles for user:', userId);
            
            // Získání uživatele pro zjištění role
            const user = await this.userDao.findById(userId);
            if (!user) {
                console.error('User not found:', userId);
                throw new Error('Uživatel nenalezen');
            }
            console.log('Found user:', { id: user._id, role: user.role });

            // Pokud je uživatel trenér, získat všechny tréninky jeho atletů
            // Pokud je uživatel atlet, získat jen jeho tréninky
            let trainings = [];
            if (user.role === 'coach') {
                // Získat ID všech atletů tohoto trenéra
                const athletes = await this.userDao.findAthletesByCoachId(userId);
                console.log('Found athletes:', athletes.length);
                const athleteIds = athletes.map(athlete => athlete._id);
                
                // Získat tréninky všech těchto atletů
                trainings = await this.trainingDao.findByAthleteIds(athleteIds);
            } else {
                // Atlet vidí jen své tréninky
                trainings = await this.trainingDao.findByAthleteId(userId);
            }
            console.log('Found trainings:', trainings.length);

            // Extrahovat unikátní názvy tréninků
            const titles = [...new Set(trainings.map(training => training.title))].filter(Boolean);
            console.log('Unique titles:', titles.length);
            return titles.sort();
        } catch (error) {
            console.error('Error in getTrainingTitles:', error);
            console.error('Stack:', error.stack);
            throw error;
        }
    }

    static async getTrainingTitles(userId) {
        try {
            const trainings = await TrainingDao.getTrainingsByUserId(userId);
            const titles = [...new Set(trainings.map(training => training.title))];
            return titles;
        } catch (error) {
            console.error('Error in getTrainingTitles:', error);
            throw error;
        }
    }

    static async getTrainingsByTitle(title, userId) {
        try {
            const trainings = await TrainingDao.getTrainingsByUserId(userId);
            return trainings.filter(training => training.title === title);
        } catch (error) {
            console.error('Error in getTrainingsByTitle:', error);
            throw error;
        }
    }
}

module.exports = new TrainingAbl();
