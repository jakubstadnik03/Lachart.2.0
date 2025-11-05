// abl/TrainingAbl.js
const TrainingDao = require('../dao/trainingDao');
const UserDao = require('../dao/userDao');
const FitTraining = require('../models/fitTraining');
const StravaActivity = require('../models/StravaActivity');

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
        // Get Training records
        const trainings = await this.trainingDao.findByAthleteId(athleteId);
        
        // Get FitTraining records
        const fitTrainings = await FitTraining.find({ athleteId: athleteId.toString() });
        
        // Get StravaActivity records
        const stravaActivities = await StravaActivity.find({ userId: athleteId });
        
        // Return combined results
        return {
            trainings: trainings,
            fitTrainings: fitTrainings,
            stravaActivities: stravaActivities
        };
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
            let fitTrainings = [];
            let stravaActivities = [];
            
            if (user.role === 'coach') {
                // Získat ID všech atletů tohoto trenéra
                const athletes = await this.userDao.findAthletesByCoachId(userId);
                console.log('Found athletes:', athletes.length);
                
                if (athletes && athletes.length > 0) {
                    const athleteIds = athletes.map(athlete => athlete._id);
                    // Získat tréninky všech těchto atletů
                    trainings = await this.trainingDao.findByAthleteIds(athleteIds);
                    // FitTraining
                    fitTrainings = await FitTraining.find({ athleteId: { $in: athleteIds.map(id => id.toString()) } });
                    // StravaActivity
                    stravaActivities = await StravaActivity.find({ userId: { $in: athleteIds } });
                } else {
                    // Trenér nemá žádné atlety, vrátit prázdné pole
                    trainings = [];
                }
            } else {
                // Atlet vidí jen své tréninky
                trainings = await this.trainingDao.findByAthleteId(userId);
                // FitTraining
                fitTrainings = await FitTraining.find({ athleteId: userId.toString() });
                // StravaActivity
                stravaActivities = await StravaActivity.find({ userId: userId });
            }
            console.log('Found trainings:', trainings.length);
            console.log('Found FitTrainings:', fitTrainings.length);
            console.log('Found StravaActivities:', stravaActivities.length);

            // Extrahovat unikátní názvy z Training
            const trainingTitles = trainings.map(t => t.title).filter(Boolean);
            // Extrahovat názvy z FitTraining (titleManual || titleAuto || originalFileName)
            const fitTitles = fitTrainings.map(t => t.titleManual || t.titleAuto || t.originalFileName).filter(Boolean);
            // Extrahovat názvy z StravaActivity (titleManual || name)
            const stravaTitles = stravaActivities.map(a => a.titleManual || a.name).filter(Boolean);
            
            // Kombinovat a získat unikátní názvy
            const allTitles = [...new Set([...trainingTitles, ...fitTitles, ...stravaTitles])];
            console.log('Unique titles:', allTitles.length);
            return allTitles.sort();
        } catch (error) {
            console.error('Error in getTrainingTitles:', error);
            console.error('Stack:', error.stack);
            throw error;
        }
    }

    async getTrainingsByTitle(title, userId) {
        try {
            console.log('Getting trainings by title:', title, 'for user:', userId);
            
            // Získání uživatele pro zjištění role
            const user = await this.userDao.findById(userId);
            if (!user) {
                console.error('User not found:', userId);
                throw new Error('Uživatel nenalezen');
            }

            // Pokud je uživatel trenér, získat všechny tréninky jeho atletů
            // Pokud je uživatel atlet, získat jen jeho tréninky
            let trainings = [];
            let fitTrainings = [];
            let stravaActivities = [];
            
            if (user.role === 'coach') {
                // Získat ID všech atletů tohoto trenéra
                const athletes = await this.userDao.findAthletesByCoachId(userId);
                console.log('Found athletes:', athletes.length);
                const athleteIds = athletes.map(athlete => athlete._id);
                
                // Získat tréninky všech těchto atletů
                trainings = await this.trainingDao.findByAthleteIds(athleteIds);
                // FitTraining
                fitTrainings = await FitTraining.find({ athleteId: { $in: athleteIds.map(id => id.toString()) } });
                // StravaActivity
                stravaActivities = await StravaActivity.find({ userId: { $in: athleteIds } });
            } else {
                // Atlet vidí jen své tréninky
                trainings = await this.trainingDao.findByTitle(title, userId);
                // FitTraining
                fitTrainings = await FitTraining.find({ athleteId: userId.toString() });
                // StravaActivity
                stravaActivities = await StravaActivity.find({ userId: userId });
            }

            // Filtrovat podle title
            const normalizedTitle = title.toLowerCase().trim();
            const filteredTrainings = trainings.filter(t => t.title && t.title.toLowerCase().trim() === normalizedTitle);
            const filteredFitTrainings = fitTrainings.filter(t => {
                const tTitle = (t.titleManual || t.titleAuto || t.originalFileName || '').toLowerCase().trim();
                return tTitle === normalizedTitle;
            });
            const filteredStravaActivities = stravaActivities.filter(a => {
                const aTitle = (a.titleManual || a.name || '').toLowerCase().trim();
                return aTitle === normalizedTitle;
            });

            console.log('Returning trainings:', filteredTrainings.length);
            console.log('Returning FitTrainings:', filteredFitTrainings.length);
            console.log('Returning StravaActivities:', filteredStravaActivities.length);
            
            return {
                trainings: filteredTrainings,
                fitTrainings: filteredFitTrainings,
                stravaActivities: filteredStravaActivities
            };
        } catch (error) {
            console.error('Error in getTrainingsByTitle:', error);
            throw error;
        }
    }
}

module.exports = new TrainingAbl();
