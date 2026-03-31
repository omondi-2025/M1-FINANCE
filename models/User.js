const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const InvestmentSchema = new mongoose.Schema({
  packageName: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  dailyIncome: { type: Number, required: true, min: 0 },
  totalReturn: { type: Number, required: true, min: 0 },
  durationDays: { type: Number, default: 40, min: 1 },
  createdAt: { type: Date, default: Date.now },
  earningsCredited: { type: Number, default: 0, min: 0 },
  daysCredited: { type: Number, default: 0, min: 0 },
  nextPayoutAt: { type: Date, default: null },
  lastPayoutAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  isCompleted: { type: Boolean, default: false },
});

const UserSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\+254\d{9}$/, "Invalid Kenyan phone number format"],
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    /* ===== FINANCE FIELDS ===== */
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },

    cashouts: {
      type: Number,
      default: 0,
      min: 0,
    },

    dailyIncome: {
      type: Number,
      default: 0,
      min: 0,
    },

    referralEarnings: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* ===== INVESTMENTS ===== */
    investments: {
      type: [InvestmentSchema],
      default: [],
    },

    /* ===== REFERRAL SYSTEM ===== */
    referralCode: {
      type: String,
      unique: true,
      index: true,
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    welcomeBonusClaimed: {
      type: Boolean,
      default: false,
    },

    welcomeBonusClaimedAt: {
      type: Date,
      default: null,
    },

    resetPasswordToken: {
      type: String,
      default: null,
    },

    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/* ================= PASSWORD HASHING ================= */
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

/* ================= PASSWORD COMPARISON ================= */
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);