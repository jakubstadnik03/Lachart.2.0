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
    enum: ['admin', 'coach', 'athlete', 'tester', 'testing'],
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
  loginCount: {
    type: Number,
    default: 0
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
  gender: {
    type: String,
    enum: ['male', 'female'],
    default: 'male'
  },
  bio: String,
  avatar: {
    type: String,
    default: null
  },
  coachId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  /** Multiple coaches (coachId stays primary / legacy first coach). */
  coachIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  athletes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  /** Coach-side list of athletes invited but not yet accepted. */
  pendingAthleteIds: [{
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
  /** True for stub accounts created when a coach invites an email with no existing account. */
  isPreRegistered: {
    type: Boolean,
    default: false
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
    expiresAt: { type: Number, default: null },
    autoSync: { type: Boolean, default: false }, // Enable automatic sync
    lastSyncDate: { type: Date, default: null } // Last successful sync date
  },
  garmin: {
    athleteId: { type: String, default: null },
    accessToken: { type: String, default: null },
    refreshToken: { type: String, default: null },
    expiresAt: { type: Number, default: null },
    autoSync: { type: Boolean, default: false }, // Enable automatic sync
    lastSyncDate: { type: Date, default: null } // Last successful sync date
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
  },
  // History of power zones changes (for tracking progression over time)
  powerZonesHistory: [{
    zones: mongoose.Schema.Types.Mixed,
    source: { type: String, default: 'manual' },
    note: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
  }],
  // History of heart rate zones changes
  heartRateZonesHistory: [{
    zones: mongoose.Schema.Types.Mixed,
    source: { type: String, default: 'manual' },
    note: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
  }],
  // Onboarding modals dismissed/skipped (persisted in DB so it syncs across devices)
  onboarding: {
    basicProfileDone: { type: Boolean, default: false },
    unitsDone: { type: Boolean, default: false },
    trainingZonesDone: { type: Boolean, default: false },
    walkthroughDone: { type: Boolean, default: false }
  },
  // User preferences for units
  units: {
    distance: {
      type: String,
      enum: ['metric', 'imperial'],
      default: 'metric'
    },
    weight: {
      type: String,
      enum: ['kg', 'lbs'],
      default: 'kg'
    },
    temperature: {
      type: String,
      enum: ['celsius', 'fahrenheit'],
      default: 'celsius'
    }
  },
  // Training preferences
  trainingPreferences: {
    rpeScale: {
      type: String,
      enum: ['rpe', 'borg'],
      default: 'rpe'
    },
    paceDisplay: {
      type: String,
      enum: ['minpkm', 'kmh'],
      default: 'minpkm'
    },
    zonesMethod: {
      type: String,
      enum: ['lactate', 'hrmax', 'ftp'],
      default: 'lactate'
    },
    customZones: {
      enabled: { type: Boolean, default: false },
      zone1: { min: Number, max: Number, label: { type: String, default: 'Active Recovery' } },
      zone2: { min: Number, max: Number, label: { type: String, default: 'Endurance' } },
      zone3: { min: Number, max: Number, label: { type: String, default: 'Tempo' } },
      zone4: { min: Number, max: Number, label: { type: String, default: 'Threshold' } },
      zone5: { min: Number, max: Number, label: { type: String, default: 'VO2 Max' } },
    }
  },
  // Email/notification preferences
  notifications: {
    emailNotifications: { type: Boolean, default: true },
    trainingReminders: { type: Boolean, default: true },
    weeklyReports: { type: Boolean, default: true },
    achievementAlerts: { type: Boolean, default: true },
    /** Mobile push when Strava sync imports new activities (Expo token + optional local notification on Capacitor) */
    pushStravaImport: { type: Boolean, default: true },
    /** Mobile push + scheduled local reminders around lactate tests (Expo / Capacitor) */
    pushLactateTest: { type: Boolean, default: true },
    /** Email when coach or athlete comments on a training */
    trainingComments: { type: Boolean, default: true },
    // Used to avoid duplicate weekly report sends
    weeklyReportsLastSentWeekStart: { type: Date, default: null }
  },
  // Retention email tracking (sent dates prevent duplicates)
  retentionEmails: {
    weeklyProgressLastSent:  { type: Date, default: null },
    monthlyReportLastSent:   { type: Date, default: null },
    testReminderLastSent:    { type: Date, default: null },
    reengagementLastSent:    { type: Date, default: null },
    milestones: {
      firstTestSent:              { type: Boolean, default: false },
      fiveTestsSent:              { type: Boolean, default: false },
      tenTestsSent:               { type: Boolean, default: false },
      twentyFiveTestsSent:        { type: Boolean, default: false },
      anniversarySixMonthsSent:   { type: Boolean, default: false },
      anniversaryOneYearSent:     { type: Boolean, default: false },
      lt2ImprovementBaseline:     { type: Number,  default: null  },
      lt2Improvement5Sent:        { type: Boolean, default: false },
      lt2Improvement10Sent:       { type: Boolean, default: false },
      inviteCoachSent:            { type: Boolean, default: false },
    }
  },
  // Thank you email tracking
  thankYouEmail: {
    sent: { type: Boolean, default: false },
    sentCount: { type: Number, default: 0 },
    lastSent: { type: Date, default: null }
  },
  reactivationEmail: {
    sent: { type: Boolean, default: false },
    sentCount: { type: Number, default: 0 },
    lastSent: { type: Date, default: null }
  },
  featureAnnouncementEmail: {
    sent: { type: Boolean, default: false },
    sentCount: { type: Number, default: 0 },
    lastSent: { type: Date, default: null }
  },
  stravaReminderEmail: {
    sent: { type: Boolean, default: false },
    sentCount: { type: Number, default: 0 },
    lastSent: { type: Date, default: null }
  },
  // Email verification
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationTokenExpires: {
    type: Date,
    default: null
  },
  /**
   * How the account was first created (set for new signups; null for legacy users → inferred in API).
   * Must allow null: Mongoose enum does not treat null as “unset”, and legacy DB rows have null.
   */
  signupMethod: {
    type: String,
    required: false,
    default: null,
    validate: {
      validator(v) {
        return v == null || ['email', 'google', 'facebook', 'coach_invite'].includes(v);
      },
      message: 'Invalid signupMethod'
    }
  },
  // Geolocation captured at registration time
  registrationLocation: {
    ip: { type: String, default: null },
    country: { type: String, default: null },
    countryCode: { type: String, default: null },
    city: { type: String, default: null },
    region: { type: String, default: null },
    timezone: { type: String, default: null },
    resolvedAt: { type: Date, default: null }
  },
  // Last resolved login location (updated on successful sign-in)
  lastLoginLocation: {
    ip: { type: String, default: null },
    country: { type: String, default: null },
    countryCode: { type: String, default: null },
    city: { type: String, default: null },
    region: { type: String, default: null },
    timezone: { type: String, default: null },
    resolvedAt: { type: Date, default: null }
  },
  // Mobile push notification tokens (Expo)
  expoPushTokens: {
    type: [String],
    default: []
  },
  // Subscription reference (populated when needed)
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    default: null
  },
  /**
   * Manual premium access (comp accounts, testing, support).
   * Effective premium = premium === true OR active paid Subscription (see server/utils/premiumAccess.js).
   */
  premium: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Legacy rows / partial updates can leave signupMethod as null; Mongoose enum rejects null on save().
userSchema.pre('validate', function normalizeSignupMethod(next) {
  if (this.signupMethod === null) {
    this.set('signupMethod', undefined);
  }
  next();
});

// Odstranění starého indexu, pokud existuje; oprava email indexu na sparse (umožní více uživatelů bez emailu)
mongoose.connection.on('connected', async () => {
  try {
    await mongoose.connection.db.collection('users').dropIndex('id_1');
    console.log('Starý index byl odstraněn');
  } catch (error) {
    // index nemusí existovat
  }
  try {
    const coll = mongoose.connection.db.collection('users');
    const indexes = await coll.indexes();
    const emailIdx = indexes.find((i) => i.name === 'email_1');
    if (emailIdx && !emailIdx.sparse) {
      await coll.dropIndex('email_1');
      await mongoose.model('User').syncIndexes();
      console.log('Email index recreated with sparse: true (multiple users without email allowed)');
    }
  } catch (err) {
    console.warn('Email index migration:', err.message);
  }
});

module.exports = mongoose.model("User", userSchema);
