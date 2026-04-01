// server.js
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cron = require("node-cron");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");

dotenv.config();

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const investRoutes = require("./routes/invest");
const withdrawalRoutes = require("./routes/withdrawal");
const rechargeRoutes = require("./routes/recharge");
const adminRoutes = require("./routes/admin");
const wealthFundRoutes = require("./routes/wealthfund");
const { processScheduledEarnings } = require("./utils/earningsProcessor");

const app = express();

app.set("trust proxy", 1); // required when behind proxies (e.g., Render, Heroku)

// Security middleware
app.use(helmet());

const corsOptions = {
  origin: process.env.FRONTEND_URL || "https://m1-finance.vercel.app",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,               // 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/invest", investRoutes);
app.use("/api/user/withdrawals", withdrawalRoutes);
app.use("/api/user/withdraw", withdrawalRoutes);
app.use("/api/recharge", rechargeRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/wealthfund", wealthFundRoutes);

async function runEarningsCron(trigger = "manual") {
  const summary = await processScheduledEarnings();

  if (!summary) {
    return;
  }

  if (summary.errored) {
    console.error(`❌ Earnings cron failed (${trigger}): ${summary.message}`);
    return;
  }

  if (summary.skipped) {
    console.log(`⏭️ Earnings cron skipped (${trigger}): ${summary.reason}`);
    return;
  }

  console.log(
    `⏰ Earnings cron ran (${trigger}) at ${summary.ranAt} | package payouts: ${summary.packagePayouts} | wealth fund maturities: ${summary.maturedFunds} | total credited: KES ${Number(summary.totalCredited || 0).toFixed(2)}`
  );
}

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("✅ MongoDB Connected");
    await runEarningsCron("startup");
    cron.schedule(
      "* * * * *",
      () => {
        void runEarningsCron("every-minute");
      },
      {
        timezone: "Africa/Nairobi",
      }
    );
    console.log("⏰ Earnings cron scheduled to run every minute.");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));