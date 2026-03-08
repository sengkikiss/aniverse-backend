// src/db/index.js
// SQLite connection using sqlite3 (async, callback-based)
// Wrapped with promises for clean async/await usage

require("dotenv").config();
const sqlite3 = require("sqlite3").verbose();
const path    = require("path");

const DB_PATH = process.env.DB_PATH || "./aniverse.db";

let _db;

function getDb() {
  if (!_db) {
    _db = new sqlite3.Database(path.resolve(DB_PATH), (err) => {
      if (err) console.error("❌ DB connection error:", err.message);
    });
    _db.run("PRAGMA journal_mode = WAL");
    _db.run("PRAGMA foreign_keys = ON");
  }
  return _db;
}

// ─── Promise wrappers ───
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    getDb().exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = { getDb, run, get, all, exec };