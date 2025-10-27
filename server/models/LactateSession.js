const mongoose = require('mongoose');

const LactateSessionSchema = new mongoose.Schema({
  athleteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sport: {
    type: String,
    enum: ['run', 'bike', 'swim'],
    required: true
  },
  title: {
    type: String,
    default: 'Lactate Training Session'
  },
  description: {
    type: String
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date
  },
  envTempC: {
    type: Number
  },
  altitudeM: {
    type: Number
  },
  notes: {
    type: String
  },
  intervals: [{
    kind: {
      type: String,
      enum: ['work', 'rest'],
      required: true
    },
    seq: {
      type: Number,
      required: true
    },
    startOffsetS: {
      type: Number,
      required: true
    },
    durationS: {
      type: Number,
      required: true
    },
    targetPowerW: {
      type: Number
    },
    targetPaceSPerKm: {
      type: Number
    },
    targetLactateMin: {
      type: Number
    },
    targetLactateMax: {
      type: Number
    }
  }],
  lactateSamples: [{
    intervalId: {
      type: mongoose.Schema.Types.ObjectId
    },
    timestamp: {
      type: Date,
      required: true
    },
    valueMmolL: {
      type: Number,
      required: true
    },
    offsetFromIntervalEndS: {
      type: Number
    },
    device: {
      type: String
    },
    note: {
      type: String
    }
  }],
  streamPoints: [{
    timestamp: {
      type: Date,
      required: true
    },
    powerW: {
      type: Number
    },
    hrBpm: {
      type: Number
    },
    paceSPerKm: {
      type: Number
    },
    cadence: {
      type: Number
    }
  }],
  intervalMetrics: [{
    intervalId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    lactateEndWork: {
      type: Number
    },
    lactateEndRest: {
      type: Number
    },
    dLaDtMmolPerMin: {
      type: Number
    },
    clearanceRateMmolPerMin: {
      type: Number
    },
    tHalfS: {
      type: Number
    },
    aucMmolMin: {
      type: Number
    }
  }],
  overallMetrics: {
    avgDLADt: {
      type: Number
    },
    avgTHalf: {
      type: Number
    },
    totalAUC: {
      type: Number
    },
    recommendations: [{
      type: String
    }]
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('LactateSession', LactateSessionSchema);
