const mongoose = require('mongoose');

const testResultSchema = new mongoose.Schema({
    power: Number,
    heartRate: Number,
    lactate: Number,
    glucose: Number,
    RPE: Number
});

const testSchema = new mongoose.Schema({
    athleteId: {
        type: String,
        required: true
    },
    sport: {
        type: String,
        enum: ['run', 'bike', 'swim'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    description: String,
    baseLactate: Number,
    weight: Number,
    specifics: {
        specific: String,
        weather: String
    },
    comments: String,
    results: [{
        interval: Number,
        power: Number,
        heartRate: Number,
        lactate: Number,
        glucose: Number,
        RPE: Number
    }]
}, {
    timestamps: true,
});

module.exports = mongoose.model('Test', testSchema);