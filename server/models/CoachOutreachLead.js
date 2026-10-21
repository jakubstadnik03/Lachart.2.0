const mongoose = require("mongoose");

const coachOutreachLeadSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    sentCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },
    responded: { type: Boolean, default: false },
    registered: { type: Boolean, default: false },
    notes: { type: String, default: "" },
    // Extended fields for bulk import / campaigns
    city: { type: String, default: "" },
    country: { type: String, default: "" },
    type: { type: String, default: "" },
    website: { type: String, default: "" },
    phone: { type: String, default: "" },
    priority: { type: Number, default: 0 },
    source: { type: String, default: "manual" }, // 'manual' | 'csv'
    bulkCampaignId: { type: String, default: null },
    unsubscribed: { type: Boolean, default: false },
    /** The second letter, to leads who opened the first and said nothing.
     *  sentCount cannot stand in for this — thirteen leads already carry 2 or
     *  more from the 2026 campaign, so it cannot tell a follow-up from a
     *  repeat. Declared rather than written ad hoc because this schema is
     *  strict: an undeclared path is dropped from the write as silently as
     *  from the query, and the send would mark nobody. */
    followUpSentAt: { type: Date, default: null },
    followUpCount:  { type: Number, default: 0 },
    // Engagement. Clicks are the honest number here: opens depend on the client
    // loading a remote image, which Apple Mail Privacy Protection fakes for
    // everyone and Outlook blocks by default, so `opens` runs both high and
    // low at once and cannot be read as "people who saw it".
    opens: { type: Number, default: 0 },
    firstOpenAt: { type: Date, default: null },
    lastOpenAt: { type: Date, default: null },
    clicks: { type: Number, default: 0 },
    firstClickAt: { type: Date, default: null },
    lastClickAt: { type: Date, default: null },
    clickedUrls: { type: [String], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CoachOutreachLead", coachOutreachLeadSchema);

