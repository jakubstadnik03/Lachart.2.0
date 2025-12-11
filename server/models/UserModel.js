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
    required: false,
    unique: true,
    sparse: true, // Allows multiple null/undefined values while maintaining uniqueness for non-null values
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
  },
  // External integrations
  strava: {
    athleteId: { type: String, default: null },
    accessToken: { type: String, default: null },
    refreshToken: { type: String, default: null },
    expiresAt: { type: Number, default: null }
  },
  garmin: {
    // Placeholder for potential OAuth tokens
    accessToken: { type: String, default: null },
    refreshToken: { type: String, default: null },
    expiresAt: { type: Number, default: null }
  },
  // Power zones from lactate tests
  powerZones: {
    cycling: {
      zone1: { min: Number, max: Number, description: String },
      zone2: { min: Number, max: Number, description: String },
      zone3: { min: Number, max: Number, description: String },
      zone4: { min: Number, max: Number, description: String },
      zone5: { min: Number, max: Number, description: String },
      lt1: Number, // LTP1 in watts
      lt2: Number, // LTP2 in watts
      lastUpdated: Date
    },
    running: {
      zone1: { min: Number, max: Number, description: String }, // pace in seconds
      zone2: { min: Number, max: Number, description: String },
      zone3: { min: Number, max: Number, description: String },
      zone4: { min: Number, max: Number, description: String },
      zone5: { min: Number, max: Number, description: String },
      lt1: Number, // LTP1 in seconds (pace)
      lt2: Number, // LTP2 in seconds (pace)
      lastUpdated: Date
    },
    swimming: {
      zone1: { min: Number, max: Number, description: String }, // pace in seconds per 100m
      zone2: { min: Number, max: Number, description: String },
      zone3: { min: Number, max: Number, description: String },
      zone4: { min: Number, max: Number, description: String },
      zone5: { min: Number, max: Number, description: String },
      lt1: Number, // LTP1 in seconds (pace per 100m)
      lt2: Number, // LTP2 in seconds (pace per 100m)
      lastUpdated: Date
    }
  },
  // Heart rate zones from lactate tests or generated from max HR
  heartRateZones: {
    cycling: {
      zone1: { min: Number, max: Number, description: String },
      zone2: { min: Number, max: Number, description: String },
      zone3: { min: Number, max: Number, description: String },
      zone4: { min: Number, max: Number, description: String },
      zone5: { min: Number, max: Number, description: String },
      maxHeartRate: Number, // Max HR for cycling
      lastUpdated: Date
    },
    running: {
      zone1: { min: Number, max: Number, description: String },
      zone2: { min: Number, max: Number, description: String },
      zone3: { min: Number, max: Number, description: String },
      zone4: { min: Number, max: Number, description: String },
      zone5: { min: Number, max: Number, description: String },
      maxHeartRate: Number, // Max HR for running
      lastUpdated: Date
    },
    swimming: {
      zone1: { min: Number, max: Number, description: String },
      zone2: { min: Number, max: Number, description: String },
      zone3: { min: Number, max: Number, description: String },
      zone4: { min: Number, max: Number, description: String },
      zone5: { min: Number, max: Number, description: String },
      maxHeartRate: Number, // Max HR for swimming
      lastUpdated: Date
    }
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
