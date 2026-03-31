const express = require("express");
const jwt = require("jsonwebtoken");
const Recharge = require("../models/Recharge");
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/User");
const Notification = require("../models/Notification");
const adminAuth = require("../middleware/adminAuth");
const { sendUserEmail } = require("../utils/emailService");

const router = express.Router();

function buildSummary(recharges, withdrawals) {
  return {
    pendingRecharges: recharges.filter((item) => item.status === "Pending").length,
    pendingWithdrawals: withdrawals.filter((item) => item.status === "Pending").length,
    approvedRechargeAmount: recharges
      .filter((item) => item.status === "Approved")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    completedWithdrawalAmount: withdrawals
      .filter((item) => item.status === "Completed")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0),
  };
}

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
      return res.status(500).json({ error: "Admin credentials are not configured in .env" });
    }

    if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    const token = jwt.sign(
      {
        role: "admin",
        username,
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      success: true,
      token,
      username,
    });
  } catch (err) {
    console.error("ADMIN LOGIN ERROR:", err);
    res.status(500).json({ error: "Admin login failed" });
  }
});

router.get("/overview", adminAuth, async (req, res) => {
  try {
    const [recharges, withdrawals, notifications] = await Promise.all([
      Recharge.find().sort({ createdAt: -1 }).limit(100).lean(),
      Withdrawal.find().sort({ date: -1 }).limit(100).lean(),
      Notification.find().sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    res.json({
      summary: buildSummary(recharges, withdrawals),
      recharges,
      withdrawals,
      notifications,
    });
  } catch (err) {
    console.error("ADMIN OVERVIEW ERROR:", err);
    res.status(500).json({ error: "Failed to load admin overview" });
  }
});

router.post("/notifications", adminAuth, async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();

    if (!title || !description) {
      return res.status(400).json({ error: "Notification title and description are required" });
    }

    const activeFrom = new Date();
    const expiresAt = new Date(activeFrom.getTime() + 5 * 24 * 60 * 60 * 1000);

    const notification = await Notification.create({
      title,
      description,
      activeFrom,
      expiresAt,
      createdBy: req.admin?.username || "admin",
    });

    res.json({
      success: true,
      message: "Notification created successfully and will remain visible to users for 5 days.",
      notification,
    });
  } catch (err) {
    console.error("ADMIN NOTIFICATION CREATE ERROR:", err);
    res.status(500).json({ error: "Failed to create notification" });
  }
});

router.patch("/recharges/:id", adminAuth, async (req, res) => {
  try {
    const { action } = req.body;
    const recharge = await Recharge.findById(req.params.id);

    if (!recharge) {
      return res.status(404).json({ error: "Recharge not found" });
    }

    if (recharge.status !== "Pending") {
      return res.status(400).json({ error: `Recharge already ${recharge.status.toLowerCase()}` });
    }

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    if (action === "approve") {
      const user = await User.findById(recharge.userId);
      if (!user) {
        return res.status(404).json({ error: "Recharge user not found" });
      }

      if (!recharge.creditedToBalance) {
        user.balance = Number(user.balance || 0) + Number(recharge.amount || 0);
        await user.save();
        recharge.creditedToBalance = true;
      }

      recharge.status = "Approved";
      recharge.approvedAt = new Date();
      recharge.reviewedAt = new Date();
      await recharge.save();

      await sendUserEmail({
        to: user.email,
        subject: "M1 Finance Recharge Approved",
        text: `Hello ${user.fullName}, your recharge of KES ${recharge.amount} with code ${recharge.code} has been approved and added to your account balance.`,
        html: `<p>Hello <strong>${user.fullName}</strong>,</p><p>Your recharge of <strong>KES ${recharge.amount}</strong> with code <strong>${recharge.code}</strong> has been approved and added to your account balance.</p>`,
      });

      return res.json({
        success: true,
        message: "Recharge approved and user balance updated automatically.",
      });
    }

    recharge.status = "Rejected";
    recharge.reviewedAt = new Date();
    await recharge.save();

    const rechargeUser = await User.findById(recharge.userId);
    await sendUserEmail({
      to: rechargeUser?.email,
      subject: "M1 Finance Recharge Rejected",
      text: `Hello ${rechargeUser?.fullName || "User"}, your recharge of KES ${recharge.amount} with code ${recharge.code} has been rejected. Please contact support if you need help.`,
      html: `<p>Hello <strong>${rechargeUser?.fullName || "User"}</strong>,</p><p>Your recharge of <strong>KES ${recharge.amount}</strong> with code <strong>${recharge.code}</strong> has been rejected. Please contact support if you need help.</p>`,
    });

    res.json({
      success: true,
      message: "Recharge rejected successfully.",
    });
  } catch (err) {
    console.error("ADMIN RECHARGE REVIEW ERROR:", err);
    res.status(500).json({ error: "Failed to review recharge" });
  }
});

router.patch("/withdrawals/:id", adminAuth, async (req, res) => {
  try {
    const { action } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.id);

    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    if (withdrawal.status !== "Pending") {
      return res.status(400).json({ error: `Withdrawal already ${withdrawal.status.toLowerCase()}` });
    }

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const user = await User.findById(withdrawal.userId);
    if (!user) {
      return res.status(404).json({ error: "Withdrawal user not found" });
    }

    if (action === "approve") {
      withdrawal.status = "Completed";
      withdrawal.processedAt = new Date();
      user.cashouts = Number(user.cashouts || 0) + Number(withdrawal.amount || 0);

      await Promise.all([withdrawal.save(), user.save()]);

      await sendUserEmail({
        to: user.email,
        subject: "M1 Finance Withdrawal Approved",
        text: `Hello ${user.fullName}, your withdrawal request of KES ${withdrawal.amount} has been approved. After the 10% service fee, you will receive KES ${Number(withdrawal.netAmount || withdrawal.amount || 0).toFixed(2)}.`,
        html: `<p>Hello <strong>${user.fullName}</strong>,</p><p>Your withdrawal request of <strong>KES ${withdrawal.amount}</strong> has been approved. After the 10% service fee, you will receive <strong>KES ${Number(withdrawal.netAmount || withdrawal.amount || 0).toFixed(2)}</strong>.</p>`,
      });

      return res.json({
        success: true,
        message: `Withdrawal confirmed successfully. User receives Ksh ${Number(withdrawal.netAmount || withdrawal.amount || 0).toFixed(2)} after the 10% service fee.`,
      });
    }

    user.balance = Number(user.balance || 0) + Number(withdrawal.amount || 0);
    withdrawal.status = "Rejected";
    withdrawal.processedAt = new Date();

    await Promise.all([withdrawal.save(), user.save()]);

    await sendUserEmail({
      to: user.email,
      subject: "M1 Finance Withdrawal Rejected",
      text: `Hello ${user.fullName}, your withdrawal request of KES ${withdrawal.amount} has been rejected and the deducted amount has been refunded to your account balance.`,
      html: `<p>Hello <strong>${user.fullName}</strong>,</p><p>Your withdrawal request of <strong>KES ${withdrawal.amount}</strong> has been rejected and the deducted amount has been refunded to your account balance.</p>`,
    });

    res.json({
      success: true,
      message: "Withdrawal rejected and user balance refunded.",
    });
  } catch (err) {
    console.error("ADMIN WITHDRAWAL REVIEW ERROR:", err);
    res.status(500).json({ error: "Failed to review withdrawal" });
  }
});

module.exports = router;
