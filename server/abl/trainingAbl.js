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

    /**
     * Create or update Training record from FitTraining or StravaActivity when lactate is added
     */
    async syncTrainingFromSource(sourceType, sourceData, userId) {
        try {
            // Map sport from source to Training format
            let sport = 'run'; // default
            if (sourceType === 'fit') {
                const fitSport = sourceData.sport || 'generic';
                if (fitSport === 'cycling') sport = 'bike';
                else if (fitSport === 'running') sport = 'run';
                else if (fitSport === 'swimming') sport = 'swim';
            } else if (sourceType === 'strava') {
                const stravaSport = sourceData.sport || '';
                if (stravaSport.toLowerCase().includes('ride') || stravaSport.toLowerCase().includes('bike')) sport = 'bike';
                else if (stravaSport.toLowerCase().includes('run')) sport = 'run';
                else if (stravaSport.toLowerCase().includes('swim')) sport = 'swim';
            }

            // Get title
            const title = sourceType === 'fit' 
                ? (sourceData.titleManual || sourceData.titleAuto || sourceData.originalFileName || 'Untitled Training')
                : (sourceData.titleManual || sourceData.name || 'Untitled Activity');

            // Get date
            const date = sourceType === 'fit' 
                ? (sourceData.timestamp || new Date())
                : (sourceData.startDate || new Date());

            // Get duration in format "HH:MM:SS" or "MM:SS"
            const totalTime = sourceType === 'fit'
                ? (sourceData.totalElapsedTime || sourceData.totalTimerTime || 0)
                : (sourceData.elapsedTime || sourceData.movingTime || 0);
            
            const hours = Math.floor(totalTime / 3600);
            const minutes = Math.floor((totalTime % 3600) / 60);
            const seconds = totalTime % 60;
            const duration = hours > 0 
                ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                : `${minutes}:${String(seconds).padStart(2, '0')}`;

            // Get description
            const description = sourceType === 'fit'
                ? sourceData.description
                : sourceData.description;

            // Convert all laps to results array (not just those with lactate)
            const results = [];
            const laps = sourceData.laps || [];
            
            laps.forEach((lap, index) => {
                // Skip if this lap is likely the entire activity (duration >= 95% of total time)
                const totalTime = sourceType === 'fit'
                    ? (sourceData.totalElapsedTime || sourceData.totalTimerTime || 0)
                    : (sourceData.elapsedTime || sourceData.movingTime || 0);
                // Get lap duration in seconds - ensure it's a number
                let lapDuration = 0;
                if (lap.totalElapsedTime !== undefined && lap.totalElapsedTime !== null) {
                    lapDuration = typeof lap.totalElapsedTime === 'number' ? lap.totalElapsedTime : parseFloat(lap.totalElapsedTime) || 0;
                } else if (lap.totalTimerTime !== undefined && lap.totalTimerTime !== null) {
                    lapDuration = typeof lap.totalTimerTime === 'number' ? lap.totalTimerTime : parseFloat(lap.totalTimerTime) || 0;
                } else if (lap.elapsed_time !== undefined && lap.elapsed_time !== null) {
                    lapDuration = typeof lap.elapsed_time === 'number' ? lap.elapsed_time : parseFloat(lap.elapsed_time) || 0;
                }
                
                // Skip if duration is 0 or if this is the whole activity lap
                if (lapDuration <= 0) return;
                if (totalTime > 0 && lapDuration >= totalTime * 0.95) return;

                // Calculate rest time (time between laps) in seconds
                let restSeconds = 0;
                if (index > 0 && laps[index - 1]) {
                    // Calculate rest based on startTime if available
                    if (lap.startTime && laps[index - 1].startTime) {
                        const currentStart = new Date(lap.startTime).getTime();
                        const prevStart = new Date(laps[index - 1].startTime).getTime();
                        const prevDuration = laps[index - 1].totalElapsedTime || laps[index - 1].totalTimerTime || laps[index - 1].elapsed_time || 0;
                        const prevEnd = prevStart + (prevDuration * 1000);
                        restSeconds = Math.max(0, Math.round((currentStart - prevEnd) / 1000));
                    }
                }

                // Format duration as string for display, but also store duration in seconds
                const lapHours = Math.floor(lapDuration / 3600);
                const lapMinutes = Math.floor((lapDuration % 3600) / 60);
                const lapSeconds = lapDuration % 60;
                const lapDurationStr = lapHours > 0
                    ? `${lapHours}:${String(lapMinutes).padStart(2, '0')}:${String(lapSeconds).padStart(2, '0')}`
                    : `${lapMinutes}:${String(lapSeconds).padStart(2, '0')}`;

                // Format rest as string for display
                const restHours = Math.floor(restSeconds / 3600);
                const restMinutes = Math.floor((restSeconds % 3600) / 60);
                const restSecs = restSeconds % 60;
                const restStr = restHours > 0
                    ? `${restHours}:${String(restMinutes).padStart(2, '0')}:${String(restSecs).padStart(2, '0')}`
                    : `${restMinutes}:${String(restSecs).padStart(2, '0')}`;

                // Use durationSeconds as the primary duration value (in seconds)
                const durationSecondsValue = Math.round(lapDuration);
                
                results.push({
                    interval: index + 1,
                    duration: durationSecondsValue, // Store duration in seconds as number
                    durationSeconds: durationSecondsValue, // Also store in durationSeconds for clarity
                    durationType: 'time',
                    rest: restSeconds, // Store rest in seconds as number
                    restSeconds: restSeconds, // Also store in restSeconds for clarity
                    intensity: '', // Could be calculated from power/HR zones
                    power: lap.avgPower || lap.maxPower || lap.average_watts || lap.max_watts || null,
                    heartRate: lap.avgHeartRate || lap.maxHeartRate || lap.average_heartrate || lap.max_heartrate || null,
                    lactate: lap.lactate || null, // Include lactate if available, otherwise null
                    RPE: null
                });
            });

            // Check if Training record already exists
            const athleteId = userId.toString();
            const existingTraining = await this.trainingDao.findByTitle(title, athleteId);
            const matchingTraining = existingTraining.find(t => 
                t.title === title && 
                t.athleteId === athleteId &&
                Math.abs(new Date(t.date).getTime() - new Date(date).getTime()) < 24 * 60 * 60 * 1000 // Same day
            );

            if (matchingTraining) {
                // Update existing Training with all results
                // Replace all results with new ones from source (keeps everything in sync)
                // But preserve lactate values from existing results if they exist and are not in new results
                const updatedResults = results.map(newResult => {
                    // Try to find matching existing result by interval
                    const existingResult = matchingTraining.results.find(r => r.interval === newResult.interval);
                    if (existingResult && existingResult.lactate && (!newResult.lactate || newResult.lactate === null)) {
                        // Preserve existing lactate if new result doesn't have one
                        return {
                            ...newResult,
                            lactate: existingResult.lactate
                        };
                    }
                    // Use new result (may include updated lactate)
                    return newResult;
                });

                // Add any existing results that don't have a match in new results (shouldn't happen, but safety)
                matchingTraining.results.forEach(existingResult => {
                    const hasMatch = updatedResults.some(r => r.interval === existingResult.interval);
                    if (!hasMatch) {
                        updatedResults.push(existingResult);
                    }
                });

                // Sort by interval
                updatedResults.sort((a, b) => a.interval - b.interval);

                return await this.trainingDao.update(matchingTraining._id, {
                    results: updatedResults,
                    description: description || matchingTraining.description,
                    duration: duration || matchingTraining.duration
                });
            } else {
                // Create new Training record with all intervals
                const trainingData = {
                    athleteId: athleteId,
                    sport: sport,
                    type: '', // Could be derived from workout pattern
                    title: title,
                    description: description || '',
                    date: date,
                    duration: duration,
                    intensity: '', // Could be calculated
                    results: results,
                    specifics: {},
                    comments: '',
                    unitSystem: 'metric',
                    inputMode: 'pace'
                };

                return await this.trainingDao.createTraining(trainingData);
            }
        } catch (error) {
            console.error('Error syncing Training from source:', error);
            // Don't throw - this is a background sync, shouldn't fail the main operation
            return null;
        }
    }
}

module.exports = new TrainingAbl();
