const express = require("express");
const router = express.Router();
const Recharge = require("../models/Recharge");
const User = require("../models/User");
const auth = require("../middleware/auth");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

function generateCode() {
  return crypto.randomBytes(6).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
}

async function generateUniqueCode() {
  let code = generateCode();

  while (await Recharge.findOne({ code })) {
    code = generateCode();
  }

  return code;
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function isValidMpesaMessage(message = "") {
  const text = message.replace(/\s+/g, " ").trim();
  return (
    text.length >= 40 &&
    /\b(?:Confirmed|confirmed)\b/.test(text) &&
    /\b(?:Ksh|KES)\s?[\d,.]+/i.test(text) &&
    /\b(?:balance|M-PESA|transaction cost)\b/i.test(text) &&
    /\b[A-Z0-9]{8,12}\b/.test(text)
  );
}

function extractTransactionId(message = "") {
  const text = String(message).replace(/\s+/g, " ").trim();
  const confirmedMatch = text.match(/\b([A-Z0-9]{8,12})\b(?=\s+(?:Confirmed|confirmed))/);
  const fallbackMatch = text.match(/\b([A-Z0-9]{8,12})\b/);
  return (confirmedMatch?.[1] || fallbackMatch?.[1] || "").toUpperCase();
}

async function sendRechargeDocument(recharge, user = {}, adminUrl) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

  try {
    await transporter.sendMail({
      from: `"M1 Finance" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `RECHARGE CONFIRMATION — CODE: ${recharge.code}`,
      text: `Recharge confirmation document\n\nFull Name: ${recharge.fullName}\nPhone: ${recharge.phone}\nEmail: ${user.email || "N/A"}\nReferral Code: ${user.referralCode || "N/A"}\nRecharge Amount: KES ${recharge.amount}\nSystem Code: ${recharge.code}\nTransaction Message: ${recharge.transactionMessage || "N/A"}\nStatus: ${recharge.status}\n\nAdmin page: ${adminUrl}`,
      html: `
        <h2>M1 Finance Recharge Confirmation Document</h2>
        <table style="border-collapse:collapse;width:100%;max-width:700px;">
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Full Name</strong></td><td style="padding:8px;border:1px solid #ddd;">${recharge.fullName}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Phone Number</strong></td><td style="padding:8px;border:1px solid #ddd;">${recharge.phone}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Email</strong></td><td style="padding:8px;border:1px solid #ddd;">${user.email || "N/A"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>User Referral Code</strong></td><td style="padding:8px;border:1px solid #ddd;">${user.referralCode || "N/A"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Recharge Amount</strong></td><td style="padding:8px;border:1px solid #ddd;">KES ${recharge.amount}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Unique System Code</strong></td><td style="padding:8px;border:1px solid #ddd;">${recharge.code}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>M-Pesa Transaction ID</strong></td><td style="padding:8px;border:1px solid #ddd;">${recharge.transactionId || "N/A"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Transaction Message</strong></td><td style="padding:8px;border:1px solid #ddd;white-space:pre-wrap;">${(recharge.transactionMessage || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Status</strong></td><td style="padding:8px;border:1px solid #ddd;">${recharge.status}</td></tr>
        </table>
        <p style="margin-top:16px;">
          <a href="${adminUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;">
            Open Admin Page
          </a>
        </p>
      `,
    });
  } catch (err) {
    console.error("Recharge email notification failed:", err.message);
  }
}

router.post("/create", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let { fullName, phone, amount } = req.body;
    fullName = (fullName || user.fullName || "").trim();
    phone = (phone || user.phone || "").trim();
    amount = Number(amount);

    if (!fullName || !phone || !Number.isFinite(amount)) {
      return res.status(400).json({ success: false, message: "Please fill all fields correctly" });
    }

    if (amount < 50) {
      return res.status(400).json({ success: false, message: "Minimum recharge is Ksh 50" });
    }

    const code = await generateUniqueCode();
    const recharge = await Recharge.create({
      userId: user._id,
      fullName,
      phone,
      amount,
      code,
    });

    res.json({
      success: true,
      message: "Recharge request created. Complete the payment and continue.",
      rechargeId: recharge._id,
      code: recharge.code,
      email: user.email,
      referralCode: user.referralCode,
    });
  } catch (err) {
    console.error("Recharge create error:", err);
    res.status(500).json({ success: false, message: "Failed to create recharge request" });
  }
});

router.post("/submit-message", auth, async (req, res) => {
  try {
    const { rechargeId, transactionMessage } = req.body;

    const recharge = await Recharge.findOne({
      _id: rechargeId,
      userId: req.user.id,
    });

    if (!recharge) {
      return res.status(404).json({ success: false, message: "Recharge not found" });
    }

    if (recharge.transactionId || recharge.transactionMessage) {
      return res.status(400).json({
        success: false,
        message: "This recharge confirmation has already been sent and cannot be submitted twice.",
      });
    }

    if (!transactionMessage || !isValidMpesaMessage(transactionMessage)) {
      return res.status(400).json({
        success: false,
        message: "Please paste the full complete M-Pesa transaction message, including the code, amount and balance details.",
      });
    }

    const transactionId = extractTransactionId(transactionMessage);
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "Unable to detect the M-Pesa transaction code from that message.",
      });
    }

    const duplicateTransaction = await Recharge.findOne({
      transactionId,
      _id: { $ne: recharge._id },
    });

    if (duplicateTransaction) {
      recharge.transactionMessage = transactionMessage.trim();
      recharge.submittedAt = new Date();
      recharge.status = "Rejected";
      recharge.reviewedAt = new Date();
      await recharge.save();

      return res.status(400).json({
        success: false,
        message: "This M-Pesa transaction code already exists in the system and has been rejected.",
      });
    }

    recharge.transactionId = transactionId;
    recharge.transactionMessage = transactionMessage.trim();
    recharge.submittedAt = new Date();
    await recharge.save();

    const user = await User.findById(recharge.userId);
    const adminUrl = `${req.protocol}://${req.get("host")}/admin.html`;
    await sendRechargeDocument(recharge, user || {}, adminUrl);

    res.json({
      success: true,
      message: "Recharge confirmation document sent successfully. Waiting for admin confirmation.",
      status: recharge.status,
      transactionId,
    });
  } catch (err) {
    console.error("Message save error:", err);
    res.status(500).json({ success: false, message: "Failed to save transaction message" });
  }
});

router.post("/final-submit", auth, async (req, res) => {
  try {
    const { rechargeId } = req.body;

    const recharge = await Recharge.findOne({
      _id: rechargeId,
      userId: req.user.id,
    });

    if (!recharge) {
      return res.status(404).json({ success: false, message: "Recharge not found" });
    }

    if (recharge.status !== "Approved") {
      return res.json({
        success: false,
        message: "Recharge is still pending admin confirmation.",
        status: recharge.status,
      });
    }

    const user = await User.findById(recharge.userId);

    res.json({
      success: true,
      message: "Recharge approved successfully.",
      newBalance: Number(user?.balance || 0),
      status: recharge.status,
    });
  } catch (err) {
    console.error("Final submit error:", err);
    res.status(500).json({ success: false, message: "Failed to check recharge status" });
  }
});

router.get("/history", auth, async (req, res) => {
  try {
    const recharges = await Recharge.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(recharges);
  } catch (err) {
    console.error("Recharge history error:", err);
    res.status(500).json([]);
  }
});

module.exports = router;