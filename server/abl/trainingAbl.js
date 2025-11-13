// abl/TrainingAbl.js
const TrainingDao = require('../dao/trainingDao');
const UserDao = require('../dao/userDao');
const FitTraining = require('../models/fitTraining');
const StravaActivity = require('../models/StravaActivity');

const toNumber = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
};

const getLapDurationSeconds = (lap = {}) => {
    const candidates = [
        lap.totalElapsedTime,
        lap.total_elapsed_time,
        lap.totalTimerTime,
        lap.total_timer_time,
        lap.elapsed_time,
        lap.duration
    ];

    for (const candidate of candidates) {
        const numeric = toNumber(candidate);
        if (numeric && numeric > 0) {
            return numeric;
        }
    }

    return 0;
};

const getLapPowerValue = (lap = {}) => {
    const candidates = [
        lap.avgPower,
        lap.avg_power,
        lap.average_watts,
        lap.average_watt,
        lap.power,
        lap.maxPower,
        lap.max_power,
        lap.max_watts
    ];

    for (const candidate of candidates) {
        const numeric = toNumber(candidate);
        if (numeric !== null && numeric !== undefined) {
            return numeric;
        }
    }

    return null;
};

const calculateMedian = (values = []) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }

    return sorted[mid];
};

const selectImportantLaps = (laps = [], sourceType = 'fit') => {
    if (!Array.isArray(laps) || laps.length === 0) {
        return [];
    }

    const metrics = laps.map((lap, index) => {
        const durationSeconds = getLapDurationSeconds(lap);
        const power = getLapPowerValue(lap);

        return {
            index,
            lap,
            durationSeconds,
            power
        };
    });

    const validDuration = metrics.filter(m => m.durationSeconds > 0);

    if (!validDuration.length) {
        return [];
    }

    let selectedIndices = validDuration.map(m => m.index);

    if (sourceType === 'strava') {
        const powerValues = validDuration
            .map(m => m.power)
            .filter(p => p !== null && p > 0);

        if (powerValues.length) {
            const avgPower = powerValues.reduce((sum, p) => sum + p, 0) / powerValues.length;
            selectedIndices = validDuration
                .filter(m => m.power !== null && m.power >= avgPower)
                .map(m => m.index);

            if (!selectedIndices.length) {
                selectedIndices = validDuration
                    .filter(m => m.power !== null && m.power > 0)
                    .sort((a, b) => b.power - a.power)
                    .slice(0, Math.min(6, powerValues.length))
                    .map(m => m.index);
            }
        } else {
            selectedIndices = validDuration.map(m => m.index);
        }
    } else if (sourceType === 'fit') {
        const workCandidates = validDuration.filter(m => m.power !== null && m.power > 0);

        if (workCandidates.length) {
            const durations = workCandidates.map(m => m.durationSeconds);
            const powers = workCandidates.map(m => m.power);
            const medianDuration = calculateMedian(durations);
            const medianPower = calculateMedian(powers);

            const durationTolerance = Math.max(10, medianDuration * 0.25);
            const powerTolerance = medianPower > 0 ? Math.max(15, medianPower * 0.3) : 25;

            const maxDuration = Math.max(...workCandidates.map(m => m.durationSeconds));
            const longDurationThreshold = Math.max(20 * 60, Math.round(maxDuration * 0.6));
            const longDurationCandidates = workCandidates.filter(m => m.durationSeconds >= longDurationThreshold);
            if (longDurationCandidates.length > 0) {
                selectedIndices = longDurationCandidates
                    .sort((a, b) => a.index - b.index)
                    .map(m => m.index);
            }

            if (selectedIndices.length === 0) {
                const extendedThreshold = Math.max(15 * 60, Math.round(medianDuration * 1.2));
                const extendedCandidates = workCandidates.filter(m => m.durationSeconds >= extendedThreshold);
                if (extendedCandidates.length > 0) {
                    selectedIndices = extendedCandidates
                        .sort((a, b) => a.index - b.index)
                        .map(m => m.index);
                }
            }

            const primary = workCandidates.filter(m => {
                const durationMatch = Math.abs(m.durationSeconds - medianDuration) <= durationTolerance;
                const powerMatch = Math.abs(m.power - medianPower) <= powerTolerance;
                return durationMatch && powerMatch;
            });

            if (selectedIndices.length === 0 && primary.length >= 2) {
                selectedIndices = primary.map(m => m.index);
            } else if (selectedIndices.length === 0) {
                const ranked = workCandidates
                    .map(m => {
                        const durationScore = medianDuration > 0
                            ? Math.abs(m.durationSeconds - medianDuration) / medianDuration
                            : 0;
                        const powerScore = medianPower > 0
                            ? Math.abs(m.power - medianPower) / medianPower
                            : 0;

                        return {
                            ...m,
                            score: durationScore + powerScore
                        };
                    })
                    .sort((a, b) => a.score - b.score);

                selectedIndices = ranked
                    .slice(0, Math.min(8, ranked.length))
                    .map(m => m.index);
            }
        } else {
            selectedIndices = validDuration
                .filter(m => m.durationSeconds >= 30)
                .map(m => m.index);
        }
    }

    if (!selectedIndices.length) {
        selectedIndices = [validDuration[0].index];
    }

    const limitedIndices = selectedIndices
        .sort((a, b) => a - b)
        .slice(0, 20);

    const indexSet = new Set(limitedIndices);

    return metrics
        .filter(m => indexSet.has(m.index))
        .sort((a, b) => a.index - b.index)
        .map(m => m.lap);
};

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

            const user = await this.userDao.findById(userId);
            if (!user) {
                console.error('User not found:', userId);
                throw new Error('Uživatel nenalezen');
            }

            let trainings = [];

            if (user.role === 'coach') {
                const athletes = await this.userDao.findAthletesByCoachId(userId);
                console.log('Found athletes:', athletes.length);

                if (athletes && athletes.length > 0) {
                    const athleteIds = athletes.map(athlete => athlete._id);
                    trainings = await this.trainingDao.findByAthleteIds(athleteIds);
                }
            } else {
                trainings = await this.trainingDao.findByAthleteId(userId);
            }

            console.log('Found trainings:', trainings.length);

            const titles = [...new Set(
                trainings
                    .map(t => t.title)
                    .filter(Boolean)
            )].sort();

            console.log('Unique titles:', titles.length);
            return titles;
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
    async syncTrainingFromSource(sourceType, sourceData, userId, options = {}) {
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
            const totalActivitySeconds = sourceType === 'fit'
                ? (sourceData.totalElapsedTime || sourceData.totalTimerTime || 0)
                : (sourceData.elapsedTime || sourceData.movingTime || 0);
            
            const hours = Math.floor(totalActivitySeconds / 3600);
            const minutes = Math.floor((totalActivitySeconds % 3600) / 60);
            const seconds = totalActivitySeconds % 60;
            const duration = hours > 0 
                ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                : `${minutes}:${String(seconds).padStart(2, '0')}`;

            // Get description
            const description = sourceType === 'fit'
                ? sourceData.description
                : sourceData.description;

            const results = [];
            const laps = Array.isArray(sourceData.laps) ? sourceData.laps : [];

            let filteredLaps;
            const optionLapIndices = Array.isArray(options.selectedLapIndices)
                ? options.selectedLapIndices
                    .map((value) => typeof value === 'number' ? value : parseInt(value, 10))
                    .filter((value) => Number.isInteger(value) && value >= 0)
                : [];

            if (optionLapIndices.length > 0) {
                const uniqueIndices = [...new Set(optionLapIndices)].sort((a, b) => a - b);
                filteredLaps = uniqueIndices
                    .map(index => laps[index])
                    .filter(lap => lap);
            } else {
                filteredLaps = selectImportantLaps(laps, sourceType);
            }
            
            filteredLaps.forEach((lap, index) => {
                const lapDuration = getLapDurationSeconds(lap);

                if (lapDuration <= 0) {
                    return;
                }

                if (totalActivitySeconds > 0 && lapDuration >= totalActivitySeconds * 0.95) {
                    return;
                }

                let restSeconds = 0;
                if (index > 0 && filteredLaps[index - 1]) {
                    const previousLap = filteredLaps[index - 1];
                    if (lap.startTime && previousLap.startTime) {
                        const currentStart = new Date(lap.startTime).getTime();
                        const prevStart = new Date(previousLap.startTime).getTime();
                        const prevDuration = getLapDurationSeconds(previousLap);
                        const prevEnd = prevStart + (prevDuration * 1000);
                        restSeconds = Math.max(0, Math.round((currentStart - prevEnd) / 1000));
                    }
                }

                const durationSecondsValue = Math.round(lapDuration);
                const lapPower = getLapPowerValue(lap);
                const lapHeartRate = lap.avgHeartRate || lap.maxHeartRate || lap.average_heartrate || lap.max_heartrate || null;
                
                results.push({
                    interval: index + 1,
                    duration: durationSecondsValue,
                    durationSeconds: durationSecondsValue,
                    durationType: 'time',
                    rest: restSeconds,
                    restSeconds: restSeconds,
                    intensity: '',
                    power: lapPower,
                    heartRate: lapHeartRate,
                    lactate: lap.lactate || null,
                    RPE: null
                });
            });

            // Check if Training record already exists
            // Use date and timestamp to find the correct training, not just title
            // This ensures we update the right training even if title changes
            const athleteId = userId.toString();
            const allTrainings = await this.trainingDao.findByAthleteId(athleteId);
            
            // Find training by date and timestamp (within 1 hour window for same activity)
            const sourceTimestamp = sourceType === 'fit' 
                ? (sourceData.timestamp ? new Date(sourceData.timestamp).getTime() : null)
                : (sourceData.startDate ? new Date(sourceData.startDate).getTime() : null);
            
            let matchingTraining = null;
            
            if (sourceTimestamp) {
                // First try to find by exact or very close timestamp (within 1 hour)
                matchingTraining = allTrainings.find(t => {
                    const trainingDate = new Date(t.date).getTime();
                    const timeDiff = Math.abs(trainingDate - sourceTimestamp);
                    return timeDiff < 60 * 60 * 1000; // Within 1 hour
                });
            }
            
            // If not found by timestamp, try to find by date and similar duration
            if (!matchingTraining && totalActivitySeconds > 0) {
                const dateStart = new Date(date);
                dateStart.setHours(0, 0, 0, 0);
                const dateEnd = new Date(date);
                dateEnd.setHours(23, 59, 59, 999);
                
                matchingTraining = allTrainings.find(t => {
                    const trainingDate = new Date(t.date);
                    const isSameDay = trainingDate >= dateStart && trainingDate <= dateEnd;
                    
                    if (!isSameDay) return false;
                    
                    // Check if duration is similar (within 10% difference)
                    const trainingDuration = this.parseDurationToSeconds(t.duration);
                    if (trainingDuration > 0) {
                        const durationDiff = Math.abs(trainingDuration - totalActivitySeconds);
                        const durationTolerance = Math.max(60, totalActivitySeconds * 0.1); // 10% or 1 minute
                        return durationDiff <= durationTolerance;
                    }
                    
                    return false;
                });
            }

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

                // Update references if not already set
                const updateData = {
                    title: title, // Update title to match the new title
                    results: updatedResults,
                    description: description || matchingTraining.description,
                    duration: duration || matchingTraining.duration
                };
                
                // Set source reference if not already set
                if (sourceType === 'fit' && sourceData._id && !matchingTraining.sourceFitTrainingId) {
                    updateData.sourceFitTrainingId = sourceData._id.toString();
                } else if (sourceType === 'strava' && sourceData._id && !matchingTraining.sourceStravaActivityId) {
                    updateData.sourceStravaActivityId = sourceData._id.toString();
                }
                
                updateData.athleteId = matchingTraining.athleteId;
                updateData.sport = matchingTraining.sport;
                updateData.date = matchingTraining.date;

                return await this.trainingDao.update(matchingTraining._id, updateData);
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
                
                // Set source reference
                if (sourceType === 'fit' && sourceData._id) {
                    trainingData.sourceFitTrainingId = sourceData._id.toString();
                } else if (sourceType === 'strava' && sourceData._id) {
                    trainingData.sourceStravaActivityId = sourceData._id.toString();
                }

                return await this.trainingDao.createTraining(trainingData);
            }
        } catch (error) {
            console.error('Error syncing Training from source:', error);
            // Don't throw - this is a background sync, shouldn't fail the main operation
            return null;
        }
    }

    /**
     * Parse duration string (HH:MM:SS or MM:SS) to seconds
     */
    parseDurationToSeconds(durationStr) {
        if (!durationStr || typeof durationStr !== 'string') {
            return 0;
        }
        
        const parts = durationStr.split(':').map(Number);
        if (parts.length === 3) {
            // HH:MM:SS
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            // MM:SS
            return parts[0] * 60 + parts[1];
        }
        
        return 0;
    }
}

module.exports = new TrainingAbl();
