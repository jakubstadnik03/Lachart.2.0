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
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CoachOutreachLead", coachOutreachLeadSchema);

