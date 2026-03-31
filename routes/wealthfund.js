const express = require("express");
const auth = require("../middleware/auth");
const User = require("../models/User");
const WealthFundInvestment = require("../models/WealthFundInvestment");

const router = express.Router();
const DAY_MS = 24 * 60 * 60 * 1000;

const wealthFundPlans = [
  {
    name: "South Africa Oil",
    minInvestment: 100,
    dailyRate: 0.05,
    durationDays: 10,
    description: "Earn 5% daily for 10 days. Principal and profit are rolled back to the main account at maturity.",
  },
  {
    name: "Petrol in Nigeria",
    minInvestment: 100,
    dailyRate: 0.10,
    durationDays: 20,
    description: "Earn 10% daily for 20 days. Principal and profit are rolled back to the main account at maturity.",
  },
  {
    name: "Crypto Trading",
    minInvestment: 500,
    dailyRate: 0.15,
    durationDays: 10,
    description: "Earn 15% daily for 10 days. Principal and profit are rolled back to the main account at maturity.",
  },
];

router.get("/plans", auth, async (req, res) => {
  res.json(wealthFundPlans);
});

router.get("/history", auth, async (req, res) => {
  try {
    const history = await WealthFundInvestment.find({ userId: req.user.id }).sort({ startedAt: -1 });
    res.json(history);
  } catch (err) {
    console.error("WEALTH FUND HISTORY ERROR:", err);
    res.status(500).json([]);
  }
});

router.post("/invest", auth, async (req, res) => {
  try {
    const { planName } = req.body;
    const amount = Number(req.body.amount);

    const plan = wealthFundPlans.find((item) => item.name === planName);
    if (!plan) {
      return res.status(400).json({ success: false, message: "Invalid wealth fund selected" });
    }

    if (!Number.isFinite(amount) || amount < plan.minInvestment) {
      return res.status(400).json({
        success: false,
        message: `Minimum investment for ${plan.name} is Ksh ${plan.minInvestment}`,
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (Number(user.balance || 0) < amount) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    const startedAt = new Date();
    const dailyProfit = Number((amount * plan.dailyRate).toFixed(2));
    const totalReturn = Number((amount + dailyProfit * plan.durationDays).toFixed(2));

    user.balance = Number(user.balance || 0) - amount;
    await user.save();

    const fund = await WealthFundInvestment.create({
      userId: user._id,
      planName: plan.name,
      amount,
      dailyRate: plan.dailyRate,
      dailyProfit,
      durationDays: plan.durationDays,
      totalReturn,
      startedAt,
      nextReflectionAt: new Date(startedAt.getTime() + DAY_MS),
    });

    res.json({
      success: true,
      message: `${plan.name} investment started successfully. Earnings begin reflecting after 24 hours from the exact investment time.`,
      balance: Number(user.balance || 0),
      investment: fund,
    });
  } catch (err) {
    console.error("WEALTH FUND INVEST ERROR:", err);
    res.status(500).json({ success: false, message: "Failed to start wealth fund investment" });
  }
});

module.exports = router;
