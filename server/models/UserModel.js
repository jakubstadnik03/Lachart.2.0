const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  surname: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'coach', 'athlete'],
    default: 'athlete'
  },
  dateOfBirth: Date,
  address: String,
  phone: String,
  height: Number,
  weight: Number,
  sport: String,
  specialization: String,
  bio: String,
  coachId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  athletes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  resetPasswordToken: String,
  resetPasswordExpires: Date,
}, {
  timestamps: true
});

// Odstranění starého indexu, pokud existuje
mongoose.connection.on('connected', async () => {
  try {
    await mongoose.connection.db.collection('users').dropIndex('id_1');
    console.log('Starý index byl odstraněn');
  } catch (error) {
  }
});

module.exports = mongoose.model("User", userSchema);
