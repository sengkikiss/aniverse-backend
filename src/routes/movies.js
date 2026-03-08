// src/routes/movies.js
const router = require("express").Router();
const { run, get, all } = require("../db");
const { authenticate, requireAdmin, optionalAuth } = require("../middleware/auth");

async function enrichMovie(movie) {
  if (!movie) return null;
  const genre = (await all(`SELECT g.name FROM genres g JOIN movie_genres mg ON mg.genre_id=g.id WHERE mg.movie_id=?`, [movie.id])).map(r => r.name);
  const tags  = (await all(`SELECT t.name FROM tags t JOIN movie_tags mt ON mt.tag_id=t.id WHERE mt.movie_id=?`, [movie.id])).map(r => r.name);
  return { ...movie, genre, tags };
}

async function syncGenresAndTags(movieId, genres = [], tags = []) {
  await run("DELETE FROM movie_genres WHERE movie_id=?", [movieId]);
  await run("DELETE FROM movie_tags   WHERE movie_id=?", [movieId]);
  for (const g of genres) {
    await run("INSERT OR IGNORE INTO genres (name) VALUES (?)", [g]);
    const row = await get("SELECT id FROM genres WHERE name=?", [g]);
    await run("INSERT OR IGNORE INTO movie_genres (movie_id,genre_id) VALUES (?,?)", [movieId, row.id]);
  }
  for (const t of tags) {
    await run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [t]);
    const row = await get("SELECT id FROM tags WHERE name=?", [t]);
    await run("INSERT OR IGNORE INTO movie_tags (movie_id,tag_id) VALUES (?,?)", [movieId, row.id]);
  }
}

// GET /api/movies/genres
router.get("/genres", async (req, res) => {
  try {
    const rows = await all("SELECT name FROM genres ORDER BY name");
    res.json(rows.map(r => r.name));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/movies/tags
router.get("/tags", async (req, res) => {
  try {
    const rows = await all("SELECT name FROM tags ORDER BY name");
    res.json(rows.map(r => r.name));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/movies
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { q, type, genre, status, sort = "rating", order = "desc", page = 1, limit = 20 } = req.query;

    const conditions = [];
    const params = [];

    if (q) { conditions.push("(m.title LIKE ? OR m.description LIKE ?)"); params.push(`%${q}%`, `%${q}%`); }
    if (type   && type   !== "all") { conditions.push("m.type=?");   params.push(type); }
    if (status && status !== "all") { conditions.push("m.status=?"); params.push(status); }

    const whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    // Genre filter using subquery to avoid duplicates
    let genreFilter = "";
    const genreParams = [];
    if (genre && genre !== "all") {
      genreFilter = `AND m.id IN (
        SELECT mg.movie_id FROM movie_genres mg
        JOIN genres g ON g.id = mg.genre_id WHERE g.name = ?
      )`;
      genreParams.push(genre);
    }

    const sortMap  = { rating:"m.rating", year:"m.year", title:"m.title", episodes:"m.episodes" };
    const orderDir = order === "asc" ? "ASC" : "DESC";
    const orderBy  = `ORDER BY ${sortMap[sort] || "m.rating"} ${orderDir}`;

    const pageNum  = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * pageSize;

    const allParams = [...params, ...genreParams];

    const countRow = await get(
      `SELECT COUNT(*) as c FROM movies m ${whereClause} ${genreFilter}`,
      allParams
    );
    const total = countRow.c;
    const rows  = await all(
      `SELECT m.* FROM movies m ${whereClause} ${genreFilter} ${orderBy} LIMIT ? OFFSET ?`,
      [...allParams, pageSize, offset]
    );

    const data = await Promise.all(rows.map(enrichMovie));
    res.json({ data, pagination: { total, page: pageNum, limit: pageSize, totalPages: Math.ceil(total / pageSize) } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/movies/:id
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const movie = await get("SELECT * FROM movies WHERE id=?", [req.params.id]);
    if (!movie) return res.status(404).json({ error: "Movie not found" });
    res.json(await enrichMovie(movie));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/movies
router.post("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, type, status, seasons, episodes, year, rating, views, cover, banner, description, videoUrl, genre=[], tags=[] } = req.body;
    if (!title || !type || !cover || !description)
      return res.status(400).json({ error: "title, type, cover and description are required" });
    const info = await run(
      `INSERT INTO movies (title,type,status,seasons,episodes,year,rating,views,cover,banner,description,video_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [title, type, status||"Ongoing", seasons||1, episodes||1, year||new Date().getFullYear(), rating||0, views||"0", cover, banner||cover, description, videoUrl||null]
    );
    await syncGenresAndTags(info.lastID, genre, tags);
    const movie = await get("SELECT * FROM movies WHERE id=?", [info.lastID]);
    res.status(201).json(await enrichMovie(movie));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/movies/:id
router.put("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const existing = await get("SELECT * FROM movies WHERE id=?", [req.params.id]);
    if (!existing) return res.status(404).json({ error: "Movie not found" });
    const { title, type, status, seasons, episodes, year, rating, views, cover, banner, description, videoUrl, genre, tags } = req.body;
    await run(
      `UPDATE movies SET title=COALESCE(?,title), type=COALESCE(?,type), status=COALESCE(?,status),
       seasons=COALESCE(?,seasons), episodes=COALESCE(?,episodes), year=COALESCE(?,year),
       rating=COALESCE(?,rating), views=COALESCE(?,views), cover=COALESCE(?,cover),
       banner=COALESCE(?,banner), description=COALESCE(?,description),
       video_url=COALESCE(?,video_url), updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [title, type, status, seasons, episodes, year, rating, views, cover, banner, description, videoUrl||null, req.params.id]
    );
    if (Array.isArray(genre) || Array.isArray(tags)) {
      await syncGenresAndTags(req.params.id, Array.isArray(genre) ? genre : [], Array.isArray(tags) ? tags : []);
    }
    const updated = await get("SELECT * FROM movies WHERE id=?", [req.params.id]);
    res.json(await enrichMovie(updated));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/movies/:id
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const movie = await get("SELECT * FROM movies WHERE id=?", [req.params.id]);
    if (!movie) return res.status(404).json({ error: "Movie not found" });
    await run("DELETE FROM movies WHERE id=?", [req.params.id]);
    res.json({ message: `"${movie.title}" deleted successfully` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;