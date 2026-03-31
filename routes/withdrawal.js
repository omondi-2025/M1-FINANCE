const express = require("express");
const router = express.Router();
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/User");
const auth = require("../middleware/auth");

router.get("/today", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const withdrawal = await Withdrawal.findOne({
      userId,
      date: { $gte: start, $lte: end },
    });

    return res.json({ hasWithdrawn: Boolean(withdrawal) });
  } catch (err) {
    console.error(err);
    return res.json({ hasWithdrawn: false });
  }
});

router.get("/history", auth, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ userId: req.user.id }).sort({ date: -1 });
    res.json(withdrawals);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const amount = Number(req.body.amount);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!Number.isFinite(amount) || amount < 80) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal is Ksh 80" });
    }

    if (Number(user.balance || 0) < amount) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    const serviceFee = Number((amount * 0.10).toFixed(2));
    const netAmount = Number((amount - serviceFee).toFixed(2));

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const withdrawnToday = await Withdrawal.findOne({
      userId,
      date: { $gte: start, $lte: end },
    });

    if (withdrawnToday) {
      return res.status(400).json({ success: false, message: "You have already withdrawn today" });
    }

    user.balance = Number(user.balance || 0) - amount;
    await user.save();

    const newWithdrawal = new Withdrawal({
      userId,
      fullName: user.fullName,
      phone: user.phone,
      amount,
      serviceFee,
      netAmount,
      status: "Pending",
    });

    await newWithdrawal.save();

    res.json({
      success: true,
      message: `Withdrawal request submitted. A 10% service fee of Ksh ${serviceFee.toFixed(2)} will be deducted, so you will receive Ksh ${netAmount.toFixed(2)} once approved.`,
      newBalance: Number(user.balance || 0),
      serviceFee,
      netAmount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;