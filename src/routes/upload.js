// src/routes/upload.js
const router = require("express").Router();
const multer = require("multer");
const path   = require("path");
const fs     = require("fs");
const { authenticate, requireAdmin } = require("../middleware/auth");

// ─── Ensure folders exist ───
const VIDEO_DIR = path.resolve("./uploads/videos");
const IMAGE_DIR = path.resolve("./uploads/images");
[VIDEO_DIR, IMAGE_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ─── Video storage ───
const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEO_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `video-${Date.now()}-${Math.round(Math.random()*1e5)}${ext}`);
  },
});
const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".mp4",".webm",".mkv",".avi",".mov",".m4v"];
    allowed.includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true) : cb(new Error("Only video files allowed"));
  },
});

// ─── Image storage ───
const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGE_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `img-${Date.now()}-${Math.round(Math.random()*1e5)}${ext}`);
  },
});
const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg",".jpeg",".png",".webp",".gif",".avif"];
    allowed.includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true) : cb(new Error("Only image files allowed (jpg, png, webp, gif)"));
  },
});

// ─── POST /api/upload/video ───
router.post("/video", authenticate, requireAdmin, uploadVideo.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No video file provided" });
  const url = `${req.protocol}://${req.get("host")}/api/videos/${req.file.filename}`;
  res.json({ message: "Video uploaded!", filename: req.file.filename, size: req.file.size, url });
});

// ─── POST /api/upload/image ───
router.post("/image", authenticate, requireAdmin, uploadImage.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image file provided" });
  const url = `${req.protocol}://${req.get("host")}/api/images/${req.file.filename}`;
  res.json({ message: "Image uploaded!", filename: req.file.filename, size: req.file.size, url });
});

// ─── GET /api/videos/:filename  (with range/seek support) ───
router.get("/videos/:filename", (req, res) => {
  const fp = path.join(VIDEO_DIR, req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: "Video not found" });
  const stat  = fs.statSync(fp);
  const total = stat.size;
  const range = req.headers.range;
  if (range) {
    const [s, e] = range.replace(/bytes=/, "").split("-");
    const start  = parseInt(s, 10);
    const end    = e ? parseInt(e, 10) : Math.min(start + 10*1024*1024, total-1);
    res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${total}`, "Accept-Ranges": "bytes", "Content-Length": end-start+1, "Content-Type": "video/mp4" });
    fs.createReadStream(fp, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Length": total, "Content-Type": "video/mp4", "Accept-Ranges": "bytes" });
    fs.createReadStream(fp).pipe(res);
  }
});

// ─── GET /api/images/:filename ───
router.get("/images/:filename", (req, res) => {
  const fp = path.join(IMAGE_DIR, req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: "Image not found" });
  const ext  = path.extname(fp).toLowerCase();
  const mime = { ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png", ".webp":"image/webp", ".gif":"image/gif", ".avif":"image/avif" };
  res.setHeader("Content-Type", mime[ext] || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=31536000");
  fs.createReadStream(fp).pipe(res);
});

// ─── DELETE /api/upload/video/:filename ───
router.delete("/video/:filename", authenticate, requireAdmin, (req, res) => {
  const fp = path.join(VIDEO_DIR, req.params.filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  res.json({ message: "Deleted" });
});

// ─── DELETE /api/upload/image/:filename ───
router.delete("/image/:filename", authenticate, requireAdmin, (req, res) => {
  const fp = path.join(IMAGE_DIR, req.params.filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  res.json({ message: "Deleted" });
});

module.exports = router;