const mongoose = require('mongoose');
const ProtocolTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, maxlength: 500 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String },
  sport: { type: String, enum: ['bike', 'run', 'swim', 'all'], default: 'all' },
  isPublic: { type: Boolean, default: false },
  protocol: {
    workDuration: { type: Number, default: 360 },      // seconds
    recoveryDuration: { type: Number, default: 60 },   // seconds
    startPower: { type: Number, default: 100 },        // watts
    powerIncrement: { type: Number, default: 20 },     // watts per step
    maxSteps: { type: Number, default: 8 },
  },
  sharedWithAthletes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });
module.exports = mongoose.model('ProtocolTemplate', ProtocolTemplateSchema);
