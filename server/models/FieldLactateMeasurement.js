const mongoose = require('mongoose');

const fieldLactateMeasurementSchema = new mongoose.Schema({
  athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  value: { type: Number, required: true }, // mmol/L
  recordedAt: { type: Date, default: Date.now },
  notes: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'assigned'], default: 'pending' },
  assignment: {
    trainingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Training', default: null },
    stravaActivityId: { type: String, default: null },
    lapIndex: { type: Number, default: null }, // 0-based
    lapNumber: { type: Number, default: null }, // 1-based display
    trainingTitle: { type: String, default: null },
    trainingDate: { type: Date, default: null },
  },
}, { timestamps: true });

fieldLactateMeasurementSchema.index({ athleteId: 1, status: 1, recordedAt: -1 });

module.exports = mongoose.model('FieldLactateMeasurement', fieldLactateMeasurementSchema);
