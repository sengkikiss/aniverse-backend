// src/server.js
require("dotenv").config();
const express   = require("express");
const cors      = require("cors");
const rateLimit = require("express-rate-limit");
const path      = require("path");
const fs        = require("fs");

const authRoutes     = require("./routes/auth");
const movieRoutes    = require("./routes/movies");
const userRoutes     = require("./routes/users");
const uploadRoutes   = require("./routes/upload");
const episodeRoutes  = require("./routes/episodes");

const app  = express();
const PORT = process.env.PORT || 5000;

["./uploads/videos","./uploads/images"].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(path.resolve(d), { recursive: true });
});

// Auto-initialize DB tables on startup
try { require("./db/setup.js"); } catch(e) { console.log("DB init:", e.message); }
try { require("./db/migrate.js"); } catch(e) { console.log("DB migrate:", e.message); }

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);
app.use("/api/", rateLimit({ windowMs: 15*60*1000, max: 500 }));
app.use("/api/auth/login",    rateLimit({ windowMs: 15*60*1000, max: 20 }));
app.use("/api/auth/register", rateLimit({ windowMs: 15*60*1000, max: 20 }));

if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => { console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`); next(); });
}

app.use("/api/auth",     authRoutes);
app.use("/api/movies",   movieRoutes);
app.use("/api/users",    userRoutes);
app.use("/api/upload",   uploadRoutes);
app.use("/api/episodes", episodeRoutes);
app.use("/api/videos",   (req, res, next) => { req.url = "/videos" + req.url; uploadRoutes(req, res, next); });
app.use("/api/images",   (req, res, next) => { req.url = "/images" + req.url; uploadRoutes(req, res, next); });

app.get("/api/health", (_req, res) => res.json({ status: "ok", version: "2.0.0" }));
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, _req, res, _next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large" });
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n⛩️  VG ANIME API → http://localhost:${PORT}`);
  console.log(`📁 Uploads: ${path.resolve("./uploads")}\n`);
});