// src/routes/auth.js
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const https  = require("https");
const { run, get } = require("../db");
const { authenticate } = require("../middleware/auth");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "828583374951-at4463gt1l62s1cor4kamtjnk6ohqjuo.apps.googleusercontent.com";

function generateTokens(userId) {
  const accessToken  = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
  const refreshToken = jwt.sign({ id: userId, type: "refresh" }, process.env.JWT_SECRET, { expiresIn: "30d" });
  return { accessToken, refreshToken };
}

async function saveRefreshToken(userId, token) {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await run("INSERT OR REPLACE INTO refresh_tokens (user_id,token,expires_at) VALUES (?,?,?)", [userId, token, expires]);
}

function safeUser(u) { const { password, ...rest } = u; return rest; }

// ─── Verify Google ID token via Google's tokeninfo endpoint ───
function verifyGoogleToken(idToken) {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`;
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const payload = JSON.parse(data);
          if (payload.error) return reject(new Error("Invalid Google token"));
          if (payload.aud !== GOOGLE_CLIENT_ID) return reject(new Error("Token client ID mismatch"));
          resolve(payload);
        } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "name, email and password required" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const existing = await get("SELECT id FROM users WHERE email=?", [email]);
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const hash   = bcrypt.hashSync(password, 10);
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e11d48&color=fff&size=80`;
    const info   = await run("INSERT INTO users (name,email,password,role,avatar,provider) VALUES (?,?,?,'user',?,'email')", [name, email, hash, avatar]);
    const user   = await get("SELECT * FROM users WHERE id=?", [info.lastID]);
    const tokens = generateTokens(user.id);
    await saveRefreshToken(user.id, tokens.refreshToken);
    res.status(201).json({ user: safeUser(user), ...tokens });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const user = await get("SELECT * FROM users WHERE email=?", [email]);
    if (!user || !user.password) return res.status(401).json({ error: "Invalid email or password" });
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: "Invalid email or password" });

    const tokens = generateTokens(user.id);
    await saveRefreshToken(user.id, tokens.refreshToken);
    res.json({ user: safeUser(user), ...tokens });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GOOGLE — accepts Google userinfo from frontend access token flow
router.post("/google", async (req, res) => {
  try {
    const { googleId, email, name, avatar } = req.body;
    if (!email || !name) return res.status(400).json({ error: "email and name required" });

    let user = await get("SELECT * FROM users WHERE email=?", [email]);
    if (!user) {
      const pic  = avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e11d48&color=fff&size=80`;
      const info = await run(
        "INSERT INTO users (name,email,role,avatar,provider,google_id) VALUES (?,?,'user',?,'google',?)",
        [name, email, pic, googleId || null]
      );
      user = await get("SELECT * FROM users WHERE id=?", [info.lastID]);
    } else {
      const pic = avatar || user.avatar;
      await run("UPDATE users SET avatar=?, google_id=COALESCE(?,google_id) WHERE id=?", [pic, googleId || null, user.id]);
      user = await get("SELECT * FROM users WHERE id=?", [user.id]);
    }

    const tokens = generateTokens(user.id);
    await saveRefreshToken(user.id, tokens.refreshToken);
    res.json({ user: safeUser(user), ...tokens });
  } catch (e) {
    console.error("Google auth error:", e.message);
    res.status(500).json({ error: "Google sign-in failed: " + e.message });
  }
});

// REFRESH
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "refreshToken required" });
    const stored = await get("SELECT * FROM refresh_tokens WHERE token=? AND expires_at > datetime('now')", [refreshToken]);
    if (!stored) return res.status(401).json({ error: "Invalid or expired refresh token" });
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user    = await get("SELECT * FROM users WHERE id=?", [decoded.id]);
    if (!user) return res.status(401).json({ error: "User not found" });
    const tokens  = generateTokens(user.id);
    await saveRefreshToken(user.id, tokens.refreshToken);
    await run("DELETE FROM refresh_tokens WHERE token=?", [refreshToken]);
    res.json({ user: safeUser(user), ...tokens });
  } catch (e) { res.status(401).json({ error: "Invalid token" }); }
});

// LOGOUT
router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await run("DELETE FROM refresh_tokens WHERE token=?", [refreshToken]);
    res.json({ message: "Logged out" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ME
router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await get("SELECT * FROM users WHERE id=?", [req.user.id]);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(safeUser(user));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;