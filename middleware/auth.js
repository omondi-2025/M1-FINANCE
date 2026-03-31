const jwt = require("jsonwebtoken");

const INVALID_TOKEN_VALUES = new Set(["", "null", "undefined", "NaN"]);

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.slice(7).trim();

  if (!token || INVALID_TOKEN_VALUES.has(token)) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = { id: decoded.id };

    if (process.env.NODE_ENV === "development") {
      console.log("Decoded JWT:", decoded);
    }

    next();
  } catch (err) {
    const noisyJwtErrors = new Set(["jwt malformed", "invalid token", "jwt must be provided"]);
    if (!noisyJwtErrors.has(err.message)) {
      console.error("JWT ERROR:", err.message);
    }
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};