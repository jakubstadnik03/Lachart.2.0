const mongoose = require('mongoose');
const TestCommentSchema = new mongoose.Schema({
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true, index: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String, required: true },
  authorRole: { type: String, enum: ['coach', 'athlete', 'admin'], required: true },
  text: { type: String, required: true, maxlength: 2000, trim: true },
}, { timestamps: true });
module.exports = mongoose.model('TestComment', TestCommentSchema);
