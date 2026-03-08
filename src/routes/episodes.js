// src/routes/episodes.js
const router = require("express").Router();
const { run, get, all } = require("../db");
const { authenticate, requireAdmin, optionalAuth } = require("../middleware/auth");

// ─── GET all seasons+episodes for a movie ───
// GET /api/episodes/movie/:movieId
router.get("/movie/:movieId", optionalAuth, async (req, res) => {
  try {
    const movie = await get("SELECT id,title FROM movies WHERE id=?", [req.params.movieId]);
    if (!movie) return res.status(404).json({ error: "Movie not found" });

    const seasons = await all(
      "SELECT * FROM seasons WHERE movie_id=? ORDER BY season_number ASC",
      [req.params.movieId]
    );

    const result = await Promise.all(seasons.map(async (s) => {
      const episodes = await all(
        "SELECT * FROM episodes WHERE season_id=? ORDER BY episode_number ASC",
        [s.id]
      );
      return { ...s, episodes };
    }));

    res.json({ movie, seasons: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET single episode ───
// GET /api/episodes/:id
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const ep = await get("SELECT * FROM episodes WHERE id=?", [req.params.id]);
    if (!ep) return res.status(404).json({ error: "Episode not found" });
    const season = await get("SELECT * FROM seasons WHERE id=?", [ep.season_id]);
    const movie  = await get("SELECT id,title,cover,banner,type FROM movies WHERE id=?", [season.movie_id]);
    res.json({ ...ep, season, movie });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ADMIN: Create season ───
// POST /api/episodes/season
router.post("/season", authenticate, requireAdmin, async (req, res) => {
  try {
    const { movieId, seasonNumber, title } = req.body;
    if (!movieId || !seasonNumber) return res.status(400).json({ error: "movieId and seasonNumber required" });

    const existing = await get("SELECT id FROM seasons WHERE movie_id=? AND season_number=?", [movieId, seasonNumber]);
    if (existing) return res.status(409).json({ error: `Season ${seasonNumber} already exists` });

    const info   = await run(
      "INSERT INTO seasons (movie_id, season_number, title) VALUES (?,?,?)",
      [movieId, seasonNumber, title || `Season ${seasonNumber}`]
    );
    const season = await get("SELECT * FROM seasons WHERE id=?", [info.lastID]);
    res.status(201).json(season);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ADMIN: Update season ───
// PUT /api/episodes/season/:id
router.put("/season/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, seasonNumber } = req.body;
    await run(
      "UPDATE seasons SET title=COALESCE(?,title), season_number=COALESCE(?,season_number) WHERE id=?",
      [title||null, seasonNumber||null, req.params.id]
    );
    res.json(await get("SELECT * FROM seasons WHERE id=?", [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ADMIN: Delete season (cascades episodes) ───
// DELETE /api/episodes/season/:id
router.delete("/season/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await run("DELETE FROM seasons WHERE id=?", [req.params.id]);
    res.json({ message: "Season deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ADMIN: Add episode ───
// POST /api/episodes
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { seasonId, episodeNumber, title, description, duration, thumbnail, videoUrl } = req.body;
    if (!seasonId || !episodeNumber || !title)
      return res.status(400).json({ error: "seasonId, episodeNumber and title required" });

    const info = await run(
      `INSERT INTO episodes (season_id, episode_number, title, description, duration, thumbnail, video_url)
       VALUES (?,?,?,?,?,?,?)`,
      [seasonId, episodeNumber, title, description||"", duration||"", thumbnail||"", videoUrl||""]
    );
    res.status(201).json(await get("SELECT * FROM episodes WHERE id=?", [info.lastID]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ADMIN: Update episode ───
// PUT /api/episodes/:id
router.put("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { episodeNumber, title, description, duration, thumbnail, videoUrl } = req.body;
    await run(
      `UPDATE episodes SET
        episode_number=COALESCE(?,episode_number), title=COALESCE(?,title),
        description=COALESCE(?,description), duration=COALESCE(?,duration),
        thumbnail=COALESCE(?,thumbnail), video_url=COALESCE(?,video_url),
        updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [episodeNumber||null, title||null, description||null, duration||null, thumbnail||null, videoUrl||null, req.params.id]
    );
    res.json(await get("SELECT * FROM episodes WHERE id=?", [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ADMIN: Delete episode ───
// DELETE /api/episodes/:id
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await run("DELETE FROM episodes WHERE id=?", [req.params.id]);
    res.json({ message: "Episode deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;