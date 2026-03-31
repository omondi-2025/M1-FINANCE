const mongoose = require("mongoose");

const RechargeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    code: { type: String, required: true, unique: true }, // 10-char strong code

    fullName: { type: String, required: true },
    phone: { type: String, required: true },

    amount: { type: Number, required: true, min: 50 },

    transactionId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
    },

    transactionMessage: { type: String, default: "" },
    submittedAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending"
    },

    approvedAt: { type: Date },
    reviewedAt: { type: Date },
    creditedToBalance: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Recharge", RechargeSchema);