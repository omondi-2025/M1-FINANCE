const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Admin token required" });
  }

  const token = authHeader.split(" ")[1];

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
    console.error("ADMIN JWT ERROR:", err.message);
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
};
