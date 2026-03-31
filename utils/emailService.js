const nodemailer = require("nodemailer");

function hasMailConfig() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function getTransporter() {
  const emailHost = process.env.EMAIL_HOST || "smtp.gmail.com";
  const emailPort = Number(process.env.EMAIL_PORT || 465);

  return nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailPort === 465,
    family: 4,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      servername: emailHost,
      minVersion: "TLSv1.2",
    },
  });
}

function getAdminNotificationEmail() {
  return process.env.ADMIN_NOTIFICATION_EMAIL || process.env.EMAIL_USER || "";
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

async function sendAdminNotificationEmail({ subject, text, html }) {
  const adminEmail = getAdminNotificationEmail();
  if (!adminEmail) return false;

  return sendUserEmail({
    to: adminEmail,
    subject,
    text,
    html,
  });
}

module.exports = {
  sendUserEmail,
  sendAdminNotificationEmail,
  hasMailConfig,
  getAdminNotificationEmail,
};
