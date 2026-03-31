const nodemailer = require("nodemailer");

let lastEmailError = "";

function cleanEnvValue(value = "") {
  return String(value || "").trim();
}

function getEmailUser() {
  return cleanEnvValue(process.env.EMAIL_USER);
}

function getEmailPass() {
  return cleanEnvValue(process.env.EMAIL_PASS).replace(/\s+/g, "");
}

function getDefaultFromEmail() {
  return cleanEnvValue(process.env.EMAIL_FROM || process.env.EMAIL_USER || "onboarding@resend.dev");
}

function hasMailConfig() {
  return Boolean(getEmailUser() && getEmailPass());
}

function hasResendConfig() {
  return Boolean(cleanEnvValue(process.env.RESEND_API_KEY));
}

function logEmailError(prefix, message) {
  const fullMessage = `${prefix}: ${message}`;
  if (fullMessage !== lastEmailError) {
    console.error(fullMessage);
    lastEmailError = fullMessage;
  }
}

function getTransporter() {
  const emailHost = cleanEnvValue(process.env.EMAIL_HOST || "smtp.gmail.com");
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
      user: getEmailUser(),
      pass: getEmailPass(),
    },
    tls: {
      servername: emailHost,
      minVersion: "TLSv1.2",
    },
  });
}

function getAdminNotificationEmail() {
  return cleanEnvValue(process.env.ADMIN_NOTIFICATION_EMAIL || process.env.EMAIL_USER || "");
}

async function sendViaResend({ to, subject, text, html, replyTo }) {
  const apiKey = cleanEnvValue(process.env.RESEND_API_KEY);
  if (!apiKey || !to) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `M1 Finance <${getDefaultFromEmail()}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html,
      reply_to: replyTo || undefined,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Resend API ${response.status}: ${responseText}`);
  }

  return true;
}

async function sendViaSmtp({ to, subject, text, html, replyTo }) {
  if (!hasMailConfig()) return false;

  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"M1 Finance" <${getDefaultFromEmail()}>`,
    to,
    replyTo,
    subject,
    text,
    html,
  });
  return true;
}

async function sendUserEmail({ to, subject, text, html, replyTo }) {
  if (!to) return false;

  try {
    if (hasResendConfig()) {
      return await sendViaResend({ to, subject, text, html, replyTo });
    }

    return await sendViaSmtp({ to, subject, text, html, replyTo });
  } catch (err) {
    const message = err?.message || "Unknown email delivery error";

    if ((message.includes("ENETUNREACH") || message.includes("Connection timeout")) && !hasResendConfig()) {
      logEmailError(
        "EMAIL DELIVERY ERROR",
        "Render free web services block SMTP ports 25, 465 and 587. Add RESEND_API_KEY and EMAIL_FROM in Render environment variables, or upgrade the Render service to a paid instance."
      );
    } else {
      logEmailError("SEND USER EMAIL ERROR", message);
    }

    return false;
  }
}

async function sendAdminNotificationEmail({ subject, text, html, replyTo }) {
  const adminEmail = getAdminNotificationEmail();
  if (!adminEmail) return false;

  return sendUserEmail({
    to: adminEmail,
    subject,
    text,
    html,
    replyTo,
  });
}

module.exports = {
  sendUserEmail,
  sendAdminNotificationEmail,
  hasMailConfig,
  hasResendConfig,
  getAdminNotificationEmail,
};
