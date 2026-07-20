const mongoose = require('mongoose');
const TrainingCommentSchema = new mongoose.Schema({
  trainingId:   { type: String, required: true, index: true },
  trainingType: { type: String, enum: ['training', 'fitTraining', 'strava', 'planned', 'race'], default: 'training' },
  authorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName:   { type: String, required: true },
  authorRole:   { type: String, enum: ['coach', 'athlete', 'admin'], required: true },
  authorAvatar: { type: String, default: null },
  text:         { type: String, required: true, maxlength: 2000, trim: true },
}, { timestamps: true });
module.exports = mongoose.model('TrainingComment', TrainingCommentSchema);
