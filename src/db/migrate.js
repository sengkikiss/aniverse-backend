const sqlite3 = require("sqlite3").verbose();
const path    = require("path");
require("dotenv").config();

const db = new sqlite3.Database(path.resolve(process.env.DB_PATH || "./aniverse.db"));

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");
  
  db.run(`CREATE TABLE IF NOT EXISTS seasons (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id       INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    season_number  INTEGER NOT NULL DEFAULT 1,
    title          TEXT NOT NULL DEFAULT 'Season 1',
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(movie_id, season_number)
  )`, (err) => {
    if (err) console.error("seasons table:", err.message);
    else console.log("✅ seasons table ready");
  });

  db.run(`CREATE TABLE IF NOT EXISTS episodes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id       INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    episode_number  INTEGER NOT NULL DEFAULT 1,
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    duration        TEXT DEFAULT '',
    thumbnail       TEXT DEFAULT '',
    video_url       TEXT DEFAULT '',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(season_id, episode_number)
  )`, (err) => {
    if (err) console.error("episodes table:", err.message);
    else console.log("✅ episodes table ready");
    setTimeout(() => { console.log("✅ DB migration done!\n"); }, 300);
  });
});