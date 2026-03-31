const nodemailer = require("nodemailer");

function hasMailConfig() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

async function sendUserEmail({ to, subject, text, html }) {
  if (!to || !hasMailConfig()) return false;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"M1 Finance" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (err) {
    console.error("SEND USER EMAIL ERROR:", err.message);
    return false;
  }
}

module.exports = {
  sendUserEmail,
  hasMailConfig,
};
