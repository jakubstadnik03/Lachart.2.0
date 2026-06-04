/**
 * CalendarPeriod — a multi-day span on the training calendar.
 *
 * Used for high-level life/training context that covers a range of days rather
 * than a single one: Vacation, Training camp, Work trip, Illness, Race week.
 * Rendered as a thin colored band across the affected days in every calendar
 * view (month, week, dashboard strip).
 *
 * Unlike DayPlan (one doc per day) a period is ONE doc spanning startDate..endDate.
 */

const mongoose = require('mongoose');

const calendarPeriodSchema = new mongoose.Schema({
  // Whom the period is for (athlete being trained, not the coach).
  athleteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Who created it (athlete or coach).
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Inclusive local-date range, 'YYYY-MM-DD' strings (TZ-stable).
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  endDate:   { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  // Period type — drives the default color and label.
  type: {
    type: String,
    enum: ['Vacation', 'Training camp', 'Work trip', 'Illness', 'Race week'],
    required: true,
  },
  // Hex color override (defaults handled client-side from `type`).
  color: { type: String, default: null },
  // Optional free-form notes / destination ("Sierra Nevada camp").
  notes: { type: String, default: '' },
}, {
  timestamps: true,
});

// Fast range queries per athlete.
calendarPeriodSchema.index({ athleteId: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('CalendarPeriod', calendarPeriodSchema);
