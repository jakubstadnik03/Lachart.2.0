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
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CoachOutreachLead", coachOutreachLeadSchema);

