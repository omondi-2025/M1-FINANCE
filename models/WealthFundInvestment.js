const mongoose = require("mongoose");

const WealthFundInvestmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planName: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 100,
    },
    dailyRate: {
      type: Number,
      required: true,
      min: 0,
    },
    dailyProfit: {
      type: Number,
      required: true,
      min: 0,
    },
    durationDays: {
      type: Number,
      required: true,
      min: 1,
    },
    totalReturn: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["Active", "Completed"],
      default: "Active",
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    nextReflectionAt: {
      type: Date,
      required: true,
    },
    daysElapsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    accruedProfit: {
      type: Number,
      default: 0,
      min: 0,
    },
    creditedToBalance: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WealthFundInvestment", WealthFundInvestmentSchema);
