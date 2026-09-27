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

