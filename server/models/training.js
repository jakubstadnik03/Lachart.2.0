const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
    interval: Number,
    duration: String,
    rest: String,
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
    comments: String
}, {
    timestamps: true,
});

module.exports = mongoose.model('Training', trainingSchema); 