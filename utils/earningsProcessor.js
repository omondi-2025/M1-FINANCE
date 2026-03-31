const User = require("../models/User");
const EarningLog = require("../models/EarningLog");
const WealthFundInvestment = require("../models/WealthFundInvestment");
const { sendUserEmail } = require("../utils/emailService");

const DAY_MS = 24 * 60 * 60 * 1000;
let isRunning = false;

async function processPackageEarnings(now) {
  const summary = {
    payouts: 0,
    totalCredited: 0,
  };
  const users = await User.find({ "investments.0": { $exists: true } });

  for (const user of users) {
    let shouldSaveUser = false;
    const logs = [];

    for (const inv of user.investments || []) {
      const durationDays = Number(inv.durationDays || 40);
      const createdAt = inv.createdAt ? new Date(inv.createdAt) : new Date();

      if (!inv.nextPayoutAt) {
        inv.nextPayoutAt = new Date(createdAt.getTime() + DAY_MS);
      }

      if (inv.isCompleted || Number(inv.daysCredited || 0) >= durationDays) {
        inv.isCompleted = true;
        if (!inv.completedAt) {
          inv.completedAt = inv.lastPayoutAt || new Date(createdAt.getTime() + durationDays * DAY_MS);
        }
        continue;
      }

      while (
        Number(inv.daysCredited || 0) < durationDays &&
        inv.nextPayoutAt &&
        new Date(inv.nextPayoutAt).getTime() <= now.getTime()
      ) {
        const payout = Number(inv.dailyIncome || 0);
        const payoutAt = new Date(inv.nextPayoutAt);
        const currentDay = Number(inv.daysCredited || 0) + 1;

        user.balance = Number(user.balance || 0) + payout;
        inv.daysCredited = currentDay;
        inv.earningsCredited = Number(inv.earningsCredited || 0) + payout;
        inv.lastPayoutAt = payoutAt;
        inv.nextPayoutAt = new Date(payoutAt.getTime() + DAY_MS);
        shouldSaveUser = true;
        summary.payouts += 1;
        summary.totalCredited += payout;

        logs.push({
          userId: user._id,
          sourceType: "package",
          sourceName: inv.packageName || "Package Investment",
          amount: payout,
          description: `Day ${currentDay} earnings credited for ${inv.packageName || "investment"}`,
          creditedAt: payoutAt,
        });

        if (currentDay >= durationDays) {
          inv.isCompleted = true;
          inv.completedAt = payoutAt;
        }
      }
    }

    if (shouldSaveUser) {
      await user.save();
      if (logs.length) {
        await EarningLog.insertMany(logs);

        const totalAwarded = logs.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        await sendUserEmail({
          to: user.email,
          subject: "M1 Finance Investment Earnings Credited",
          text: `Hello ${user.fullName}, KES ${totalAwarded.toFixed(2)} has been credited to your account from your active package investments.`,
          html: `<p>Hello <strong>${user.fullName}</strong>,</p><p><strong>KES ${totalAwarded.toFixed(2)}</strong> has been credited to your account from your active package investments.</p>`,
        });
      }
    }
  }

  return summary;
}

async function processWealthFunds(now) {
  const summary = {
    maturedFunds: 0,
    totalCredited: 0,
  };
  const activeFunds = await WealthFundInvestment.find({ status: "Active" });

  for (const fund of activeFunds) {
    const durationDays = Number(fund.durationDays || 0);
    let updated = false;

    while (
      Number(fund.daysElapsed || 0) < durationDays &&
      fund.nextReflectionAt &&
      new Date(fund.nextReflectionAt).getTime() <= now.getTime()
    ) {
      const nextPoint = new Date(fund.nextReflectionAt);
      fund.daysElapsed = Number(fund.daysElapsed || 0) + 1;
      fund.accruedProfit = Number(fund.accruedProfit || 0) + Number(fund.dailyProfit || 0);
      fund.nextReflectionAt = new Date(nextPoint.getTime() + DAY_MS);
      updated = true;

      if (fund.daysElapsed >= durationDays) {
        fund.status = "Completed";
        fund.completedAt = nextPoint;
      }
    }

    if (fund.status === "Completed" && !fund.creditedToBalance) {
      const user = await User.findById(fund.userId);
      if (user) {
        const maturityCredit = Number(fund.amount || 0) + Number(fund.accruedProfit || 0);
        user.balance = Number(user.balance || 0) + maturityCredit;
        await user.save();

        await EarningLog.create({
          userId: user._id,
          sourceType: "wealth-fund",
          sourceName: fund.planName,
          amount: Number(fund.accruedProfit || 0),
          description: `${fund.planName} matured and returned principal plus profit to your main account.`,
          creditedAt: fund.completedAt || now,
        });

        summary.maturedFunds += 1;
        summary.totalCredited += maturityCredit;

        await sendUserEmail({
          to: user.email,
          subject: "M1 Finance Wealth Fund Earnings Credited",
          text: `Hello ${user.fullName}, your ${fund.planName} wealth fund has matured. KES ${Number(fund.accruedProfit || 0).toFixed(2)} profit plus your principal has been credited to your main account.`,
          html: `<p>Hello <strong>${user.fullName}</strong>,</p><p>Your <strong>${fund.planName}</strong> wealth fund has matured. <strong>KES ${Number(fund.accruedProfit || 0).toFixed(2)}</strong> profit plus your principal has been credited to your main account.</p>`,
        });
      }

      fund.creditedToBalance = true;
      updated = true;
    }

    if (updated) {
      await fund.save();
    }
  }

  return summary;
}

async function processScheduledEarnings() {
  if (isRunning) {
    return {
      skipped: true,
      reason: "already-running",
      packagePayouts: 0,
      maturedFunds: 0,
      totalCredited: 0,
      ranAt: new Date().toISOString(),
    };
  }

  isRunning = true;

  try {
    const now = new Date();
    const packageSummary = await processPackageEarnings(now);
    const wealthFundSummary = await processWealthFunds(now);

    return {
      skipped: false,
      errored: false,
      ranAt: now.toISOString(),
      packagePayouts: Number(packageSummary.payouts || 0),
      maturedFunds: Number(wealthFundSummary.maturedFunds || 0),
      totalCredited:
        Number(packageSummary.totalCredited || 0) + Number(wealthFundSummary.totalCredited || 0),
    };
  } catch (err) {
    console.error("EARNINGS PROCESSOR ERROR:", err);
    return {
      skipped: false,
      errored: true,
      message: err.message,
      ranAt: new Date().toISOString(),
      packagePayouts: 0,
      maturedFunds: 0,
      totalCredited: 0,
    };
  } finally {
    isRunning = false;
  }
}

module.exports = {
  processScheduledEarnings,
};
