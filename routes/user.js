const express = require("express");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const Recharge = require("../models/Recharge");
const Withdrawal = require("../models/Withdrawal");
const EarningLog = require("../models/EarningLog");
const WealthFundInvestment = require("../models/WealthFundInvestment");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");

const router = express.Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const REFERRAL_RATES = {
  1: 0.10,
  2: 0.05,
  3: 0.01,
};

const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function normalizePhone(phone = "") {
  phone = String(phone).replace(/\s+/g, "");

  if (/^(07|01)\d{8}$/.test(phone)) return `+254${phone.slice(1)}`;
  if (/^(7|1)\d{8}$/.test(phone)) return `+254${phone}`;
  if (/^254\d{9}$/.test(phone)) return `+${phone}`;
  if (/^\+254\d{9}$/.test(phone)) return phone;

  return phone;
}

function sumAmounts(items = []) {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function getWithdrawalAccess(user) {
  const hasPackageInvestment = Array.isArray(user?.investments) && user.investments.length > 0;
  const totalBalance = Number(user?.balance || 0);
  const lockedIncentiveBalance = hasPackageInvestment ? 0 : totalBalance;
  const withdrawableBalance = hasPackageInvestment ? Number(totalBalance.toFixed(2)) : 0;

  return {
    hasPackageInvestment,
    lockedIncentiveBalance: Number(lockedIncentiveBalance.toFixed(2)),
    withdrawableBalance,
    requiresPackageInvestmentForBonusWithdrawal: !hasPackageInvestment && totalBalance > 0,
  };
}

function hasEligiblePackageInvestment(user) {
  return getWithdrawalAccess(user).hasPackageInvestment;
}

function getLockedBonusAndReferralBalance(user) {
  return getWithdrawalAccess(user).lockedIncentiveBalance;
}

function getWithdrawableBalance(user) {
  return getWithdrawalAccess(user).withdrawableBalance;
}

function getWithdrawalEligibilityNote(user) {
  const access = getWithdrawalAccess(user);
  if (access.requiresPackageInvestmentForBonusWithdrawal) {
    return "Deposited/recharged money, welcome bonus and referral earnings can only be withdrawn after you invest in the Starter package or any higher package plan.";
  }

  return "Your funds are unlocked for withdrawal because you have invested in a package plan.";
}

function getRangeStarts(now = new Date()) {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(todayStart);
  const day = weekStart.getDay();
  const diff = day === 0 ? 6 : day - 1;
  weekStart.setDate(weekStart.getDate() - diff);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);

  return { todayStart, weekStart, monthStart };
}

function buildInvestmentData(user) {
  const now = new Date();

  const investments = (user.investments || []).map((inv) => {
    const startDate = inv.createdAt ? new Date(inv.createdAt) : new Date();
    const durationDays = Number(inv.durationDays || 40);
    const fallbackDays = Math.max(
      0,
      Math.min(durationDays, Math.floor((now.getTime() - startDate.getTime()) / DAY_MS))
    );
    const daysCredited = Number(inv.daysCredited ?? fallbackDays);
    const totalEarned = Number(inv.earningsCredited ?? (daysCredited * Number(inv.dailyIncome || 0)));
    const daysRemaining = Math.max(0, durationDays - daysCredited);
    const nextPayoutAt = inv.nextPayoutAt
      ? new Date(inv.nextPayoutAt)
      : new Date(startDate.getTime() + (daysCredited + 1) * DAY_MS);
    const endDate = new Date(startDate.getTime() + durationDays * DAY_MS);
    const status = inv.isCompleted || daysCredited >= durationDays ? "Completed" : "Active";

    return {
      packageName: inv.packageName,
      price: Number(inv.price || 0),
      dailyIncome: Number(inv.dailyIncome || 0),
      totalReturn: Number(inv.totalReturn || 0),
      durationDays,
      totalEarned,
      daysCredited,
      daysRemaining,
      nextPayoutAt,
      startDateTime: startDate,
      endDateTime: endDate,
      status,
    };
  });

  return {
    investments,
    totalInvested: investments.reduce((sum, inv) => sum + inv.price, 0),
    activeDailyPotential: investments
      .filter((inv) => inv.status === "Active")
      .reduce((sum, inv) => sum + inv.dailyIncome, 0),
    totalInvestmentEarned: investments.reduce((sum, inv) => sum + inv.totalEarned, 0),
  };
}

async function buildReferralData(rootUserId) {
  const members = [];
  const referralHistory = [];
  let totalEarnings = 0;

  async function walk(parentId, level) {
    if (level > 3) return;

    const referrals = await User.find({ referredBy: parentId });

    for (const member of referrals) {
      const totalInvested = (member.investments || []).reduce(
        (sum, inv) => sum + Number(inv.price || 0),
        0
      );
      const commission = Math.round(totalInvested * REFERRAL_RATES[level]);
      totalEarnings += commission;

      members.push({
        name: member.fullName,
        totalInvested,
        level,
        active: (member.investments || []).length > 0,
        commission,
        joinedAt: member.createdAt,
      });

      (member.investments || []).forEach((inv) => {
        referralHistory.push({
          referredUser: member.fullName,
          level,
          packageName: inv.packageName,
          investedAmount: Number(inv.price || 0),
          commission: Math.round(Number(inv.price || 0) * REFERRAL_RATES[level]),
          date: inv.createdAt || member.createdAt,
          status: "Earned",
        });
      });

      await walk(member._id, level + 1);
    }
  }

  await walk(rootUserId, 1);
  referralHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    members,
    referralHistory,
    totalEarnings: Math.round(totalEarnings),
  };
}

function buildLogStats(logs = []) {
  const now = new Date();
  const { todayStart, weekStart, monthStart } = getRangeStarts(now);

  const todayIncome = logs
    .filter((item) => {
      const creditedAt = new Date(item.creditedAt || item.createdAt || now);
      return creditedAt >= todayStart && item.sourceType !== "referral" && item.sourceType !== "bonus";
    })
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const weeklyEarnings = logs
    .filter((item) => new Date(item.creditedAt || item.createdAt || now) >= weekStart)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const monthlyEarnings = logs
    .filter((item) => new Date(item.creditedAt || item.createdAt || now) >= monthStart)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const referralEarnings = logs
    .filter((item) => item.sourceType === "referral")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return {
    todayIncome,
    weeklyEarnings,
    monthlyEarnings,
    referralEarnings,
    totalIncomeFromLogs: logs.reduce((sum, item) => sum + Number(item.amount || 0), 0),
  };
}

router.get("/dashboard", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const [logs, wealthFunds, completedWithdrawals] = await Promise.all([
      EarningLog.find({ userId: user._id }).sort({ creditedAt: -1 }).lean(),
      WealthFundInvestment.find({ userId: user._id }).lean(),
      Withdrawal.find({ userId: user._id, status: "Completed" }).lean(),
    ]);

    const stats = buildLogStats(logs);
    const { totalInvestmentEarned } = buildInvestmentData(user);
    const hasPackageInvestment = hasEligiblePackageInvestment(user);
    const lockedBonusReferralBalance = getLockedBonusAndReferralBalance(user);
    const withdrawableBalance = getWithdrawableBalance(user);
    const bonusAmount = user.welcomeBonusClaimed ? 100 : 0;
    const wealthFundProfit = wealthFunds.reduce((sum, fund) => sum + Number(fund.accruedProfit || 0), 0);
    const referralTotal = Number(stats.referralEarnings || user.referralEarnings || 0);
    const totalIncome = Math.max(
      stats.totalIncomeFromLogs,
      totalInvestmentEarned + referralTotal + wealthFundProfit + bonusAmount
    );

    const totalCashouts = completedWithdrawals.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const withdrawalAccess = getWithdrawalAccess(user);

    res.json({
      company: "M1 FINANCE",
      fullName: user.fullName,
      phone: user.phone,
      balance: Number(user.balance || 0),
      withdrawableBalance: withdrawalAccess.withdrawableBalance,
      lockedIncentiveBalance: withdrawalAccess.lockedIncentiveBalance,
      hasPackageInvestment: withdrawalAccess.hasPackageInvestment,
      requiresPackageInvestmentForBonusWithdrawal: withdrawalAccess.requiresPackageInvestmentForBonusWithdrawal,
      cashouts: Number(totalCashouts || 0),
      dailyIncome: Number(stats.todayIncome || 0),
      weeklyEarnings: Number(stats.weeklyEarnings || 0),
      monthlyEarnings: Number(stats.monthlyEarnings || 0),
      referralEarnings: referralTotal,
      totalIncome: Number(totalIncome || 0),
      referralCode: user.referralCode,
      hasEligiblePackageInvestment: hasPackageInvestment,
      lockedBonusReferralBalance,
      withdrawableBalance,
      withdrawalEligibilityNote: getWithdrawalEligibilityNote(user),
    });
  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

router.get("/team", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const { members, totalEarnings } = await buildReferralData(user._id);

    res.json({
      referralCode: user.referralCode,
      referralLink: `${req.protocol}://${req.get("host")}/signup.html?ref=${user.referralCode}`,
      totalEarnings,
      members,
    });
  } catch (err) {
    console.error("TEAM ERROR:", err);
    res.status(500).json({ error: "Failed to load team data" });
  }
});

router.get("/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const [approvedRecharges, logs, wealthFunds, completedWithdrawals] = await Promise.all([
      Recharge.find({ userId: user._id, status: "Approved" }).lean(),
      EarningLog.find({ userId: user._id }).sort({ creditedAt: -1 }).lean(),
      WealthFundInvestment.find({ userId: user._id }).sort({ startedAt: -1 }).lean(),
      Withdrawal.find({ userId: user._id, status: "Completed" }).lean(),
    ]);

    const { investments, totalInvested, activeDailyPotential, totalInvestmentEarned } = buildInvestmentData(user);
    const stats = buildLogStats(logs);
    const hasPackageInvestment = hasEligiblePackageInvestment(user);
    const lockedBonusReferralBalance = getLockedBonusAndReferralBalance(user);
    const withdrawableBalance = getWithdrawableBalance(user);
    const totalRecharged = approvedRecharges.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalCashouts = completedWithdrawals.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const wealthFundProfit = wealthFunds.reduce((sum, fund) => sum + Number(fund.accruedProfit || 0), 0);
    const referralTotal = Number(stats.referralEarnings || user.referralEarnings || 0);
    const totalEarnings = Math.max(
      stats.totalIncomeFromLogs,
      totalInvestmentEarned + referralTotal + wealthFundProfit + (user.welcomeBonusClaimed ? 100 : 0)
    );
    const withdrawalAccess = getWithdrawalAccess(user);

    res.json({
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      referralCode: user.referralCode,
      balance: Number(user.balance || 0),
      withdrawableBalance: withdrawalAccess.withdrawableBalance,
      lockedIncentiveBalance: withdrawalAccess.lockedIncentiveBalance,
      hasPackageInvestment: withdrawalAccess.hasPackageInvestment,
      requiresPackageInvestmentForBonusWithdrawal: withdrawalAccess.requiresPackageInvestmentForBonusWithdrawal,
      totalCashouts: Number(totalCashouts || 0),
      totalRecharged,
      totalInvested,
      dailyIncome: Number(activeDailyPotential || 0),
      totalReferralEarnings: referralTotal,
      totalWealthFundProfit: wealthFundProfit,
      totalEarnings,
      welcomeBonusClaimed: Boolean(user.welcomeBonusClaimed),
      welcomeBonusClaimedAt: user.welcomeBonusClaimedAt,
      hasEligiblePackageInvestment: hasPackageInvestment,
      lockedBonusReferralBalance,
      withdrawableBalance,
      withdrawalEligibilityNote: getWithdrawalEligibilityNote(user),
      investments,
      wealthFunds,
    });
  } catch (err) {
    console.error("PROFILE ERROR:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

router.post("/claim-welcome-bonus", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (user.welcomeBonusClaimed) {
      return res.status(400).json({
        success: false,
        message: "Welcome bonus has already been claimed on this account.",
      });
    }

    user.balance = Number(user.balance || 0) + 100;
    user.welcomeBonusClaimed = true;
    user.welcomeBonusClaimedAt = new Date();
    await user.save();

    await EarningLog.create({
      userId: user._id,
      sourceType: "bonus",
      sourceName: "Welcome Bonus",
      amount: 100,
      description: "One-time Ksh 100 registration bonus.",
      creditedAt: user.welcomeBonusClaimedAt,
    });

    res.json({
      success: true,
      message: "Ksh 100 welcome bonus claimed successfully.",
      balance: Number(user.balance || 0),
      claimedAt: user.welcomeBonusClaimedAt,
    });
  } catch (err) {
    console.error("CLAIM BONUS ERROR:", err);
    res.status(500).json({ success: false, message: "Failed to claim welcome bonus" });
  }
});

router.put("/personal-information", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const email = (req.body.email || "").trim().toLowerCase();
    const phone = normalizePhone(req.body.phone || user.phone);
    const currentPassword = String(req.body.currentPassword || "").trim();
    const newPassword = String(req.body.newPassword || "").trim();
    const confirmPassword = String(req.body.confirmPassword || "").trim();

    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email, _id: { $ne: user._id } });
      if (emailExists) {
        return res.status(400).json({ success: false, message: "Email is already in use" });
      }
      user.email = email;
    }

    if (phone && phone !== user.phone) {
      if (!/^\+254\d{9}$/.test(phone)) {
        return res.status(400).json({ success: false, message: "Phone must be a valid Kenyan number" });
      }

      const phoneExists = await User.findOne({ phone, _id: { $ne: user._id } });
      if (phoneExists) {
        return res.status(400).json({ success: false, message: "Phone number is already in use" });
      }

      user.phone = phone;
    }

    if (newPassword || confirmPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: "Current password is required" });
      }

      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: "Current password is incorrect" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: "New passwords do not match" });
      }

      user.password = newPassword;
    }

    await user.save();

    res.json({
      success: true,
      message: "Personal information updated successfully.",
      user: {
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("PERSONAL INFORMATION ERROR:", err);
    res.status(500).json({ success: false, message: "Failed to update personal information" });
  }
});

router.post("/support", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const fullName = String(req.body.fullName || user.fullName || "").trim();
    const replyEmail = String(req.body.replyEmail || user.email || "").trim().toLowerCase();
    const phone = normalizePhone(req.body.phone || user.phone);
    const subject = String(req.body.subject || "").trim();
    const message = String(req.body.message || "").trim();

    if (!fullName || !replyEmail || !subject || message.length < 20) {
      return res.status(400).json({
        success: false,
        message: "Please follow the full support email format and complete all fields.",
      });
    }

    await mailer.sendMail({
      from: `"${fullName}" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      replyTo: replyEmail,
      subject: `SUPPORT REQUEST — ${subject}`,
      text: `Support request from M1 Finance user\n\nFull Name: ${fullName}\nReply Email: ${replyEmail}\nPhone: ${phone}\nUser ID: ${user._id}\n\nSubject: ${subject}\n\nMessage:\n${message}`,
      html: `
        <h3>New Support Request</h3>
        <p><strong>Full Name:</strong> ${fullName}</p>
        <p><strong>Reply Email:</strong> ${replyEmail}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>User ID:</strong> ${user._id}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, "<br>")}</p>
      `,
    });

    res.json({
      success: true,
      message: "Support email sent successfully. Check your email for follow-up responses.",
    });
  } catch (err) {
    console.error("SUPPORT EMAIL ERROR:", err);
    res.status(500).json({ success: false, message: "Failed to send support email" });
  }
});

router.get("/statement", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    to.setHours(23, 59, 59, 999);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ error: "Invalid date range supplied" });
    }

    const [recharges, withdrawals, earnings, wealthFunds] = await Promise.all([
      Recharge.find({ userId: user._id, createdAt: { $gte: from, $lte: to } }).sort({ createdAt: -1 }).lean(),
      Withdrawal.find({ userId: user._id, date: { $gte: from, $lte: to } }).sort({ date: -1 }).lean(),
      EarningLog.find({ userId: user._id, creditedAt: { $gte: from, $lte: to } }).sort({ creditedAt: -1 }).lean(),
      WealthFundInvestment.find({ userId: user._id, startedAt: { $gte: from, $lte: to } }).sort({ startedAt: -1 }).lean(),
    ]);

    res.json({
      user: {
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        referralCode: user.referralCode,
      },
      from,
      to,
      summary: {
        totalRecharges: sumAmounts(recharges.filter((item) => item.status === "Approved")),
        totalWithdrawals: sumAmounts(withdrawals.filter((item) => item.status === "Completed")),
        totalEarnings: sumAmounts(earnings),
        totalWealthFundProfit: wealthFunds.reduce((sum, fund) => sum + Number(fund.accruedProfit || 0), 0),
      },
      recharges,
      withdrawals,
      earnings,
      wealthFunds,
      generatedAt: new Date(),
    });
  } catch (err) {
    console.error("STATEMENT ERROR:", err);
    res.status(500).json({ error: "Failed to generate statement" });
  }
});

router.get("/notifications", auth, async (req, res) => {
  try {
    const now = new Date();
    const notifications = await Notification.find({
      activeFrom: { $lte: now },
      expiresAt: { $gte: now },
    }).sort({ createdAt: -1 }).lean();

    res.json(notifications);
  } catch (err) {
    console.error("USER NOTIFICATIONS ERROR:", err);
    res.status(500).json([]);
  }
});

router.get("/history", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const [recharges, withdrawals, logs, wealthFunds] = await Promise.all([
      Recharge.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
      Withdrawal.find({ userId: user._id }).sort({ date: -1 }).lean(),
      EarningLog.find({ userId: user._id }).sort({ creditedAt: -1 }).lean(),
      WealthFundInvestment.find({ userId: user._id }).sort({ startedAt: -1 }).lean(),
    ]);

    const { referralHistory, totalEarnings: fallbackReferralEarnings } = await buildReferralData(user._id);
    const approvedRechargeTotal = recharges
      .filter((item) => item.status === "Approved")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const stats = buildLogStats(logs);
    const earningsHistory = logs.map((item) => ({
      type:
        item.sourceType === "package"
          ? "Package Earnings"
          : item.sourceType === "wealth-fund"
            ? "Wealth Fund Earnings"
            : item.sourceType === "referral"
              ? "Referral Earnings"
              : "Welcome Bonus",
      title: item.sourceName,
      amount: Number(item.amount || 0),
      status: "Credited",
      date: item.creditedAt,
      description: item.description,
    }));

    wealthFunds.forEach((fund) => {
      earningsHistory.push({
        type: "Wealth Fund Progress",
        title: fund.planName,
        amount: Number(fund.accruedProfit || 0),
        status: fund.status,
        date: fund.startedAt,
        description: `Ksh ${fund.amount} invested for ${fund.durationDays} days`,
      });
    });

    earningsHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      summary: {
        balance: Number(user.balance || 0),
        totalRecharged: approvedRechargeTotal,
        totalCashouts: sumAmounts(withdrawals.filter((item) => item.status === "Completed")),
        totalReferralEarnings: Number(stats.referralEarnings || fallbackReferralEarnings),
        totalInvestmentEarned: sumAmounts(logs.filter((item) => item.sourceType === "package")),
      },
      recharges,
      withdrawals,
      referrals: referralHistory,
      earningsHistory,
    });
  } catch (err) {
    console.error("HISTORY ERROR:", err);
    res.status(500).json({ error: "Failed to load history" });
  }
});

module.exports = router;