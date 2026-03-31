const jwt = require("jsonwebtoken");

const INVALID_TOKEN_VALUES = new Set(["", "null", "undefined", "NaN"]);

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Admin token required" });
  }

  const token = authHeader.slice(7).trim();

  if (!token || INVALID_TOKEN_VALUES.has(token)) {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "admin" || decoded.username !== process.env.ADMIN_USERNAME) {
      return res.status(403).json({ error: "Admin access only" });
    }

    req.admin = {
      username: decoded.username,
    };

    next();
  } catch (err) {
    const noisyJwtErrors = new Set(["jwt malformed", "invalid token", "jwt must be provided"]);
    if (!noisyJwtErrors.has(err.message)) {
      console.error("ADMIN JWT ERROR:", err.message);
    }
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
};
