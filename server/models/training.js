const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
    interval: Number,
    duration: Number, // Duration in seconds (primary field)
    durationSeconds: Number, // Duration in seconds (for clarity, same as duration)
    durationType: {
        type: String,
        enum: ['time', 'distance'],
        default: 'time'
    },
    rest: Number, // Rest time in seconds (primary field)
    restSeconds: Number, // Rest time in seconds (for clarity, same as rest)
    intensity: String,
    power: Number,
    heartRate: Number,
    lactate: Number,
    RPE: Number
});

const specificsSchema = new mongoose.Schema({
    specific: String,
    weather: String
});

const trainingSchema = new mongoose.Schema({
    athleteId: {
        type: String,
        required: true
    },
    sport: {
        type: String,
        enum: ['run', 'bike', 'swim'],
        required: true
    },
    type: String,
    title: {
        type: String,
        required: true
    },
    description: String,
    date: {
        type: Date,
        required: true
    },
    duration: String,
    intensity: String,
    results: [resultSchema],
    specifics: specificsSchema,
    comments: String,
    unitSystem: {
        type: String,
        enum: ['metric', 'imperial'],
        default: 'metric',
        required: false
    },
    inputMode: {
        type: String,
        enum: ['pace', 'speed'],
        default: 'pace',
        required: false
    },
    // References to source training data
    sourceFitTrainingId: {
        type: String,
        default: null
    },
    sourceStravaActivityId: {
        type: String,
        default: null
    }
}, {
    timestamps: true,
});

module.exports = mongoose.model('Training', trainingSchema); 