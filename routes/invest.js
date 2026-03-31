const express = require("express");
const User = require("../models/User");
const EarningLog = require("../models/EarningLog");
const auth = require("../middleware/auth");
const { sendUserEmail } = require("../utils/emailService");

const router = express.Router();
const DAY_MS = 24 * 60 * 60 * 1000;

// Define your packages
const packages = [
  { name: "Starter", price: 800, dailyIncome: 40, totalReturn: 1600, durationDays: 40 },
  { name: "Bronze", price: 1600, dailyIncome: 80, totalReturn: 3200, durationDays: 40 },
  { name: "Silver", price: 6000, dailyIncome: 300, totalReturn: 12000, durationDays: 40 },
  { name: "Gold", price: 15000, dailyIncome: 750, totalReturn: 30000, durationDays: 40 },
  { name: "Diamond", price: 32000, dailyIncome: 1600, totalReturn: 64000, durationDays: 40 },
  { name: "Platinum", price: 75000, dailyIncome: 3750, totalReturn: 150000, durationDays: 40 },
];

/* ================= INVEST IN PACKAGE ================= */
router.post("/", auth, async (req, res) => {
  try {
    const { package: pkgName } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const pkg = packages.find((p) => p.name === pkgName);
    if (!pkg) return res.status(400).json({ error: "Invalid package selected" });

    if (Number(user.balance || 0) < pkg.price) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const createdAt = new Date();
    const nextPayoutAt = new Date(createdAt.getTime() + DAY_MS);

    user.balance = Number(user.balance || 0) - pkg.price;
    user.investments.push({
      packageName: pkg.name,
      price: pkg.price,
      dailyIncome: pkg.dailyIncome,
      totalReturn: pkg.totalReturn,
      durationDays: pkg.durationDays,
      createdAt,
      earningsCredited: 0,
      daysCredited: 0,
      nextPayoutAt,
      isCompleted: false,
    });

    await user.save();

    const referralLogs = [];
    let referrer = await User.findById(user.referredBy);

    if (referrer) {
      const level1Commission = Number((pkg.price * 0.10).toFixed(2));
      referrer.referralEarnings = Number(referrer.referralEarnings || 0) + level1Commission;
      referrer.balance = Number(referrer.balance || 0) + level1Commission;
      await referrer.save();
      await sendUserEmail({
        to: referrer.email,
        subject: "M1 Finance Referral Earnings Credited",
        text: `Hello ${referrer.fullName}, you earned KES ${level1Commission.toFixed(2)} as a Level 1 referral commission after ${user.fullName} invested in the ${pkg.name} package.`,
        html: `<p>Hello <strong>${referrer.fullName}</strong>,</p><p>You earned <strong>KES ${level1Commission.toFixed(2)}</strong> as a Level 1 referral commission after ${user.fullName} invested in the <strong>${pkg.name}</strong> package.</p>`,
      });
      referralLogs.push({
        userId: referrer._id,
        sourceType: "referral",
        sourceName: `Level 1 - ${user.fullName}`,
        amount: level1Commission,
        description: `${user.fullName} invested in ${pkg.name} package.`,
        relatedUserId: user._id,
      });

      if (referrer.referredBy) {
        const level2 = await User.findById(referrer.referredBy);
        if (level2) {
          const level2Commission = Number((pkg.price * 0.05).toFixed(2));
          level2.referralEarnings = Number(level2.referralEarnings || 0) + level2Commission;
          level2.balance = Number(level2.balance || 0) + level2Commission;
          await level2.save();
          await sendUserEmail({
            to: level2.email,
            subject: "M1 Finance Referral Earnings Credited",
            text: `Hello ${level2.fullName}, you earned KES ${level2Commission.toFixed(2)} as a Level 2 referral commission after ${user.fullName} invested in the ${pkg.name} package.`,
            html: `<p>Hello <strong>${level2.fullName}</strong>,</p><p>You earned <strong>KES ${level2Commission.toFixed(2)}</strong> as a Level 2 referral commission after ${user.fullName} invested in the <strong>${pkg.name}</strong> package.</p>`,
          });
          referralLogs.push({
            userId: level2._id,
            sourceType: "referral",
            sourceName: `Level 2 - ${user.fullName}`,
            amount: level2Commission,
            description: `${user.fullName} invested in ${pkg.name} package.`,
            relatedUserId: user._id,
          });

          if (level2.referredBy) {
            const level3 = await User.findById(level2.referredBy);
            if (level3) {
              const level3Commission = Number((pkg.price * 0.01).toFixed(2));
              level3.referralEarnings = Number(level3.referralEarnings || 0) + level3Commission;
              level3.balance = Number(level3.balance || 0) + level3Commission;
              await level3.save();
              await sendUserEmail({
                to: level3.email,
                subject: "M1 Finance Referral Earnings Credited",
                text: `Hello ${level3.fullName}, you earned KES ${level3Commission.toFixed(2)} as a Level 3 referral commission after ${user.fullName} invested in the ${pkg.name} package.`,
                html: `<p>Hello <strong>${level3.fullName}</strong>,</p><p>You earned <strong>KES ${level3Commission.toFixed(2)}</strong> as a Level 3 referral commission after ${user.fullName} invested in the <strong>${pkg.name}</strong> package.</p>`,
              });
              referralLogs.push({
                userId: level3._id,
                sourceType: "referral",
                sourceName: `Level 3 - ${user.fullName}`,
                amount: level3Commission,
                description: `${user.fullName} invested in ${pkg.name} package.`,
                relatedUserId: user._id,
              });
            }
          }
        }
      }
    }

    if (referralLogs.length) {
      await EarningLog.insertMany(referralLogs);
    }

    return res.json({
      message: `Successfully invested in ${pkg.name} package. Earnings will start reflecting after 24 hours from ${createdAt.toLocaleString()}.`,
      nextPayoutAt,
    });
  } catch (err) {
    console.error("INVEST ERROR:", err);
    res.status(500).json({ error: "Failed to invest in package" });
  }
});

module.exports = router;