const { Lipana } = require("@lipana/sdk");
const Deposit = require("../models/Deposit");

/**
 * Lipana client (LIVE / PRODUCTION ONLY)
 * ⚠️ Do NOT auto-switch environments for payments
 */
const lipana = new Lipana({
  apiKey: process.env.LIPANA_SECRET_KEY,
  environment: "production",
});

/**
 * Initiate STK Push (Authenticated)
 */
exports.initiateStkPush = async (req, res) => {
  try {
    const { phone, amount } = req.body;

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Validate phone (+2547XXXXXXXX)
    if (!phone || !/^\+254\d{9}$/.test(phone)) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    // Validate amount
    if (!amount || isNaN(amount) || Number(amount) < 100) {
      return res.status(400).json({
        error: "Amount must be a number and at least 100",
      });
    }

    // Initiate STK Push
    const stkResponse = await lipana.transactions.initiateStkPush({
      phone,
      amount: Number(amount),
    });

    // Save pending deposit
    const deposit = await Deposit.create({
      user: userId,
      phone,
      amount: Number(amount),
      status: "PENDING",
      transactionId: stkResponse.transactionId,
      checkoutRequestID: stkResponse.checkoutRequestID,
    });

    return res.status(201).json({
      message: "STK Push initiated",
      checkoutRequestID: stkResponse.checkoutRequestID,
      depositId: deposit._id,
    });
  } catch (err) {
    console.error("STK PUSH ERROR:", err);
    return res.status(500).json({
      error: "Unable to initiate STK Push",
    });
  }
};

/**
 * M-Pesa Callback (NO AUTH)
 * Called by Lipana / Safaricom
 */
exports.mpesaCallback = async (req, res) => {
  try {
    const callback = req.body;

    console.log(
      "M-PESA CALLBACK RECEIVED:",
      JSON.stringify(callback, null, 2)
    );

    const stkCallback = callback?.Body?.stkCallback;
    if (!stkCallback) {
      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: "No stkCallback data",
      });
    }

    const { CheckoutRequestID, ResultCode } = stkCallback;

    const deposit = await Deposit.findOne({
      checkoutRequestID: CheckoutRequestID,
    });

    if (!deposit) {
      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Deposit not found",
      });
    }

    deposit.status = ResultCode === 0 ? "SUCCESS" : "FAILED";
    await deposit.save();

    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: "Accepted",
    });
  } catch (err) {
    console.error("CALLBACK ERROR:", err);
    return res.status(500).json({
      ResultCode: 1,
      ResultDesc: "Failed",
    });
  }
};

/**
 * Query Transaction Status (Authenticated)
 */
exports.queryTransaction = async (req, res) => {
  try {
    const { checkoutRequestID } = req.params;

    const deposit = await Deposit.findOne({ checkoutRequestID });

    if (!deposit) {
      return res.status(404).json({
        error: "Transaction not found",
      });
    }

    return res.status(200).json({
      checkoutRequestID,
      status: deposit.status,
      amount: deposit.amount,
      phone: deposit.phone,
    });
  } catch (err) {
    console.error("QUERY ERROR:", err);
    return res.status(500).json({
      error: "Unable to query transaction",
    });
  }
};
