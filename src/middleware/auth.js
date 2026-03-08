// src/middleware/auth.js
const jwt    = require("jsonwebtoken");
const { get } = require("../db");

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ error: "No token provided" });
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    const user    = await get("SELECT * FROM users WHERE id=?", [payload.id]);
    if (!user) return res.status(401).json({ error: "User not found" });
    req.user = user;
    next();
  } catch (e) { res.status(401).json({ error: "Invalid or expired token" }); }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin")
    return res.status(403).json({ error: "Admin access required" });
  next();
}

async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return next();
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    req.user = await get("SELECT * FROM users WHERE id=?", [payload.id]);
  } catch (_) {}
  next();
}

module.exports = { authenticate, requireAdmin, optionalAuth };