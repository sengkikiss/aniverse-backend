// src/routes/users.js
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { run, get, all } = require("../db");
const { authenticate, requireAdmin } = require("../middleware/auth");

async function enrichMovie(movie) {
  if (!movie) return null;
  const genre = (await all(`SELECT g.name FROM genres g JOIN movie_genres mg ON mg.genre_id=g.id WHERE mg.movie_id=?`, [movie.id])).map(r => r.name);
  const tags  = (await all(`SELECT t.name FROM tags t JOIN movie_tags mt ON mt.tag_id=t.id WHERE mt.movie_id=?`,   [movie.id])).map(r => r.name);
  return { ...movie, genre, tags };
}

// GET favorites
router.get("/favorites", authenticate, async (req, res) => {
  try {
    const rows = await all(`SELECT m.* FROM movies m JOIN favorites f ON f.movie_id=m.id WHERE f.user_id=? ORDER BY f.created_at DESC`, [req.user.id]);
    res.json(await Promise.all(rows.map(enrichMovie)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADD favorite
router.post("/favorites/:movieId", authenticate, async (req, res) => {
  try {
    const movie = await get("SELECT id FROM movies WHERE id=?", [req.params.movieId]);
    if (!movie) return res.status(404).json({ error: "Movie not found" });
    await run("INSERT OR IGNORE INTO favorites (user_id,movie_id) VALUES (?,?)", [req.user.id, movie.id]);
    res.status(201).json({ message: "Added to favorites" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// REMOVE favorite
router.delete("/favorites/:movieId", authenticate, async (req, res) => {
  try {
    await run("DELETE FROM favorites WHERE user_id=? AND movie_id=?", [req.user.id, req.params.movieId]);
    res.json({ message: "Removed from favorites" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET watchlist
router.get("/watchlist", authenticate, async (req, res) => {
  try {
    const rows = await all(`SELECT m.* FROM movies m JOIN watchlist w ON w.movie_id=m.id WHERE w.user_id=? ORDER BY w.created_at DESC`, [req.user.id]);
    res.json(await Promise.all(rows.map(enrichMovie)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADD watchlist
router.post("/watchlist/:movieId", authenticate, async (req, res) => {
  try {
    const movie = await get("SELECT id FROM movies WHERE id=?", [req.params.movieId]);
    if (!movie) return res.status(404).json({ error: "Movie not found" });
    await run("INSERT OR IGNORE INTO watchlist (user_id,movie_id) VALUES (?,?)", [req.user.id, movie.id]);
    res.status(201).json({ message: "Added to watchlist" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// REMOVE watchlist
router.delete("/watchlist/:movieId", authenticate, async (req, res) => {
  try {
    await run("DELETE FROM watchlist WHERE user_id=? AND movie_id=?", [req.user.id, req.params.movieId]);
    res.json({ message: "Removed from watchlist" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// UPDATE profile
router.put("/profile", authenticate, async (req, res) => {
  try {
    const { name, avatar } = req.body;
    await run("UPDATE users SET name=COALESCE(?,name), avatar=COALESCE(?,avatar), updated_at=CURRENT_TIMESTAMP WHERE id=?", [name||null, avatar||null, req.user.id]);
    const user = await get("SELECT * FROM users WHERE id=?", [req.user.id]);
    const { password, ...safe } = user;
    res.json(safe);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CHANGE password
router.put("/password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "currentPassword and newPassword required" });
    if (newPassword.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters" });
    const user = await get("SELECT * FROM users WHERE id=?", [req.user.id]);
    if (!user.password) return res.status(400).json({ error: "Google accounts cannot set a password" });
    if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(401).json({ error: "Current password is incorrect" });
    await run("UPDATE users SET password=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", [bcrypt.hashSync(newPassword, 10), user.id]);
    res.json({ message: "Password updated successfully" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: list all users
router.get("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await all("SELECT id,name,email,role,avatar,provider,created_at FROM users ORDER BY created_at DESC");
    const withCounts = await Promise.all(users.map(async u => {
      const fav = await get("SELECT COUNT(*) as c FROM favorites WHERE user_id=?", [u.id]);
      const wl  = await get("SELECT COUNT(*) as c FROM watchlist WHERE user_id=?",  [u.id]);
      return { ...u, favoritesCount: fav.c, watchlistCount: wl.c };
    }));
    res.json(withCounts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: single user
router.get("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await get("SELECT id,name,email,role,avatar,provider,created_at FROM users WHERE id=?", [req.params.id]);
    if (!user) return res.status(404).json({ error: "User not found" });
    const favorites = (await all("SELECT movie_id FROM favorites WHERE user_id=?", [user.id])).map(r => r.movie_id);
    const watchlist = (await all("SELECT movie_id FROM watchlist WHERE user_id=?",  [user.id])).map(r => r.movie_id);
    res.json({ ...user, favorites, watchlist });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: change role
router.put("/:id/role", authenticate, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!["user","admin"].includes(role)) return res.status(400).json({ error: "role must be 'user' or 'admin'" });
    if (parseInt(req.params.id) === req.user.id && role === "user") return res.status(400).json({ error: "Cannot demote yourself" });
    await run("UPDATE users SET role=? WHERE id=?", [role, req.params.id]);
    res.json({ message: `User role updated to ${role}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADMIN: delete user
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: "Cannot delete your own account" });
    const user = await get("SELECT name FROM users WHERE id=?", [req.params.id]);
    if (!user) return res.status(404).json({ error: "User not found" });
    await run("DELETE FROM users WHERE id=?", [req.params.id]);
    res.json({ message: `User "${user.name}" deleted` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;