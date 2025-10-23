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
    required: function() {
      return !this.googleId && !this.facebookId;
    }
  },
  role: {
    type: String,
    enum: ['admin', 'coach', 'athlete'],
    default: 'athlete'
  },
  admin: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  facebookId: {
    type: String,
    sparse: true,
    unique: true
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
  isRegistrationComplete: {
    type: Boolean,
    default: false
  },
  registrationToken: String,
  registrationTokenExpires: Date,
  invitationToken: {
    type: String,
    default: null
  },
  invitationTokenExpires: {
    type: Date,
    default: null
  },
  pendingCoachId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  pendingAthleteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
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
