const crypto = require("crypto");

module.exports = () => {
  return crypto
    .randomBytes(4)           // 8 characters
    .toString("hex")
    .toUpperCase()
    .slice(0, 8);
};
