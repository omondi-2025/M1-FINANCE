const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ======================
   📞 PHONE NORMALIZER
====================== */
function normalizePhone(phone) {
  if (!phone) return "";

  phone = phone.replace(/\s+/g, "");

  // 07XXXXXXXX or 01XXXXXXXX → +254XXXXXXXXX
  if (/^(07|01)\d{8}$/.test(phone)) {
    return "+254" + phone.slice(1);
  }

  // 254XXXXXXXXX → +254XXXXXXXXX
  if (/^254\d{9}$/.test(phone)) {
    return "+" + phone;
  }

  // +254XXXXXXXXX → OK
  if (/^\+254\d{9}$/.test(phone)) {
    return phone;
  }

  return phone;
}

/* 🔐 Generate random referral code */
function generateReferralCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

/* ======================
   SIGN UP
====================== */
router.post("/signup", async (req, res) => {
  try {
    let { fullName, email, phone, password, referralCode: referralInput } = req.body;

    phone = normalizePhone(phone);

    if (!/^\+254\d{9}$/.test(phone)) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    // Check existing user
    if (await User.findOne({ $or: [{ phone }, { email }] })) {
      return res.status(400).json({ error: "User already exists" });
    }

    // 🔁 Ensure UNIQUE referral code
    let referralCode;
    let exists = true;
    while (exists) {
      referralCode = generateReferralCode();
      exists = await User.findOne({ referralCode });
    }

    // Resolve referredBy
    let referredBy = null;
    if (referralInput) {
      const referrer = await User.findOne({ referralCode: referralInput });
      if (referrer) referredBy = referrer._id;
    }

    // ❗ DO NOT HASH PASSWORD HERE
    const user = await User.create({
      fullName,
      email,
      phone,
      password, // model will hash it
      referralCode,
      referredBy,
    });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        referralCode: user.referralCode,
      },
    });
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

/* ======================
   FORGOT PASSWORD
====================== */
router.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const genericResponse = {
      success: true,
      message: "If an account with that email exists, a password reset link has been sent.",
    };

    const user = await User.findOne({ email });
    if (!user) {
      return res.json(genericResponse);
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    const resetLink = `${req.protocol}://${req.get("host")}/reset-password.html?token=${rawToken}&id=${user._id}`;

    await transporter.sendMail({
      from: `"M1 Finance" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "M1 Finance Password Reset",
      text: `Hello ${user.fullName},\n\nUse the link below to reset your password:\n${resetLink}\n\nThis link expires in 30 minutes.`,
      html: `
        <p>Hello <strong>${user.fullName}</strong>,</p>
        <p>You requested to reset your M1 Finance password.</p>
        <p>
          <a href="${resetLink}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;">
            Reset Password
          </a>
        </p>
        <p>This link expires in 30 minutes.</p>
      `,
    });

    res.json(genericResponse);
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    res.status(500).json({ success: false, message: "Failed to send password reset email" });
  }
});

/* ======================
   RESET PASSWORD
====================== */
router.post("/reset-password", async (req, res) => {
  try {
    const { userId, token, newPassword, confirmPassword } = req.body;

    if (!userId || !token || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      _id: userId,
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset link" });
    }

    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({
      success: true,
      message: "Password reset successful. You can now sign in with your new password.",
    });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ success: false, message: "Failed to reset password" });
  }
});

/* ======================
   SIGN IN
====================== */
router.post("/signin", async (req, res) => {
  try {
    let { phone, password } = req.body;

    phone = normalizePhone(phone);

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // ✅ USE MODEL METHOD
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        referralCode: user.referralCode,
      },
    });
  } catch (err) {
    console.error("SIGNIN ERROR:", err);
    res.status(500).json({ error: "Signin failed" });
  }
});

module.exports = router;
