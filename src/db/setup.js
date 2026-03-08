// src/db/setup.js  —  run once: node src/db/setup.js
require("dotenv").config();
const sqlite3 = require("sqlite3").verbose();
const bcrypt  = require("bcryptjs");
const path    = require("path");

const DB_PATH = process.env.DB_PATH || "./aniverse.db";
const db      = new sqlite3.Database(path.resolve(DB_PATH));
console.log("🗄️  Setting up AniVerse database...\n");

db.serialize(() => {
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL, password TEXT, role TEXT NOT NULL DEFAULT 'user',
      avatar TEXT, provider TEXT NOT NULL DEFAULT 'email',
      google_id TEXT UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'anime', status TEXT NOT NULL DEFAULT 'Ongoing',
      seasons INTEGER NOT NULL DEFAULT 1, episodes INTEGER NOT NULL DEFAULT 1,
      year INTEGER NOT NULL, rating REAL NOT NULL DEFAULT 0.0,
      views TEXT NOT NULL DEFAULT '0', cover TEXT NOT NULL, banner TEXT,
      description TEXT NOT NULL, video_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS genres (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS movie_genres (
      movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
      PRIMARY KEY (movie_id, genre_id)
    );
    CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS movie_tags (
      movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      tag_id   INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
      PRIMARY KEY (movie_id, tag_id)
    );
    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, movie_id)
    );
    CREATE TABLE IF NOT EXISTS watchlist (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, movie_id)
    );
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL, expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `, (err) => {
    if (err) { console.error("❌ Table error:", err.message); return; }
    // Add video_url column if it doesn't exist (for existing DBs)
    db.run("ALTER TABLE movies ADD COLUMN video_url TEXT", () => {});
    console.log("✅ Tables ready");
    seedAdmin();
  });
});

function seedAdmin() {
  const email  = process.env.ADMIN_EMAIL    || "admin@aniverse.com";
  const pass   = process.env.ADMIN_PASSWORD || "admin123";
  const hash   = bcrypt.hashSync(pass, 10);
  const avatar = "https://ui-avatars.com/api/?name=Admin&background=7c3aed&color=fff&size=80";
  db.run(`INSERT OR IGNORE INTO users (name,email,password,role,avatar,provider) VALUES (?,?,?,'admin',?,'email')`,
    ["Admin", email, hash, avatar],
    (err) => {
      if (!err) console.log(`✅ Admin → ${email} / ${pass}`);
      seedMovies();
    }
  );
}

// Sample Big Buck Bunny video (free, public domain) used for all movies as demo
const DEMO_VIDEO = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const MOVIES = [
  { title:"Attack on Titan",                    type:"anime",   genre:["Action","Drama","Fantasy"],          status:"Completed", seasons:4,  episodes:87,   year:2013, rating:9.1, views:"48.2M", cover:"https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80",  description:"Humanity fights for survival against giant humanoid Titans behind enormous walls.",           tags:["Must Watch","Epic","Dark"] },
  { title:"Demon Slayer",                        type:"anime",   genre:["Action","Adventure","Supernatural"], status:"Ongoing",   seasons:4,  episodes:64,   year:2019, rating:8.9, views:"52.1M", cover:"https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400&q=80",  description:"Tanjiro vows to avenge his family and cure his demon-turned sister.",                         tags:["Popular","Beautiful Animation","Emotional"] },
  { title:"Fullmetal Alchemist: Brotherhood",    type:"anime",   genre:["Action","Adventure","Drama"],        status:"Completed", seasons:1,  episodes:64,   year:2009, rating:9.2, views:"43.0M", cover:"https://images.unsplash.com/photo-1601850496218-f403a04d4c88?w=400&q=80",  description:"Two brothers seek the Philosopher's Stone to restore their bodies after a failed ritual.",    tags:["Masterpiece","Top Rated","Must Watch"] },
  { title:"One Piece",                           type:"anime",   genre:["Action","Adventure","Comedy"],       status:"Ongoing",   seasons:21, episodes:1100, year:1999, rating:9.0, views:"120M",  cover:"https://images.unsplash.com/photo-1635805737707-575885ab0820?w=400&q=80",  description:"Luffy sails the Grand Line to become King of the Pirates and find the legendary One Piece.",  tags:["Legend","Long Running","Adventure"] },
  { title:"Jujutsu Kaisen",                      type:"anime",   genre:["Action","Supernatural","Horror"],    status:"Ongoing",   seasons:2,  episodes:47,   year:2020, rating:8.8, views:"39.4M", cover:"https://images.unsplash.com/photo-1610296669228-602fa827fc1f?w=400&q=80",  description:"Yuji Itadori joins sorcerers to collect cursed finger remnants of the demon Ryomen Sukuna.", tags:["Dark","Hype","Action-packed"] },
  { title:"Hunter x Hunter",                     type:"anime",   genre:["Action","Adventure","Fantasy"],      status:"Completed", seasons:6,  episodes:148,  year:2011, rating:9.1, views:"44.2M", cover:"https://images.unsplash.com/photo-1596495578065-6e0763fa1178?w=400&q=80",  description:"Gon Freecss sets out to become a Hunter and find his legendary father.",                      tags:["Top Rated","Complex","Must Watch"] },
  { title:"Naruto Shippuden",                    type:"anime",   genre:["Action","Adventure","Drama"],        status:"Completed", seasons:21, episodes:500,  year:2007, rating:8.6, views:"98.5M", cover:"https://images.unsplash.com/photo-1574169208507-84376144848b?w=400&q=80",  description:"Naruto Uzumaki's journey to become Hokage intensifies as ancient threats emerge.",            tags:["Classic","Emotional","Long Running"] },
  { title:"Sword Art Online",                    type:"anime",   genre:["Action","Adventure","Romance"],      status:"Completed", seasons:4,  episodes:96,   year:2012, rating:7.8, views:"35.0M", cover:"https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&q=80",  description:"Players are trapped in a VR MMO and must clear all floors or die in real life.",              tags:["Gaming","Isekai","Romance"] },
  { title:"Re:Zero",                             type:"anime",   genre:["Fantasy","Drama","Psychological"],   status:"Ongoing",   seasons:3,  episodes:50,   year:2016, rating:8.4, views:"28.7M", cover:"https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80",  description:"Subaru is transported to another world and discovers he revives upon death.",                  tags:["Dark","Emotional","Mind-bending"] },
  { title:"My Hero Academia",                    type:"anime",   genre:["Action","School","Superhero"],       status:"Completed", seasons:7,  episodes:138,  year:2016, rating:8.0, views:"41.2M", cover:"https://images.unsplash.com/photo-1614624532983-4ce03382d63d?w=400&q=80",  description:"In a world of superpowers, a powerless boy dreams of becoming the greatest hero.",            tags:["Hype","School Life","Inspiring"] },
  { title:"Death Note",                          type:"anime",   genre:["Mystery","Psychological","Thriller"],status:"Completed", seasons:1,  episodes:37,   year:2006, rating:9.0, views:"55.3M", cover:"https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=400&q=80",  description:"A genius student finds a supernatural notebook that kills anyone whose name is written in it.", tags:["Must Watch","Psychological","Iconic"] },
  { title:"Vinland Saga",                        type:"anime",   genre:["Action","Historical","Drama"],       status:"Ongoing",   seasons:2,  episodes:48,   year:2019, rating:8.8, views:"18.5M", cover:"https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=80",  description:"A young Viking warrior seeks revenge for his father's death in medieval Europe.",              tags:["Underrated","Historical","Epic"] },
  { title:"Soul Land (Douluo Dalu)",             type:"donghua", genre:["Action","Fantasy","Romance"],        status:"Ongoing",   seasons:2,  episodes:300,  year:2018, rating:8.5, views:"67.8M", cover:"https://images.unsplash.com/photo-1618519764620-7403abdbdfe9?w=400&q=80",  description:"Tang San transmigrates to a world where spirit masters cultivate unique spiritual abilities.",  tags:["Cultivation","Epic","Romance"] },
  { title:"The Daily Life of the Immortal King", type:"donghua", genre:["Comedy","Fantasy","School"],         status:"Ongoing",   seasons:3,  episodes:60,   year:2020, rating:8.3, views:"31.5M", cover:"https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80",  description:"Wang Ling, an overpowered prodigy, just wants to survive high school undetected.",             tags:["Funny","OP MC","School Life"] },
  { title:"Battle Through the Heavens",          type:"donghua", genre:["Action","Fantasy","Romance"],        status:"Ongoing",   seasons:5,  episodes:180,  year:2017, rating:8.1, views:"55.3M", cover:"https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&q=80",  description:"Xiao Yan loses his cultivation talent and fights to reclaim his power and find his mother.",   tags:["Cultivation","Popular","Long Running"] },
  { title:"Mo Dao Zu Shi",                       type:"donghua", genre:["Fantasy","Mystery","Romance"],       status:"Completed", seasons:3,  episodes:33,   year:2018, rating:9.0, views:"36.7M", cover:"https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400&q=80",  description:"A disgraced cultivator is reincarnated and must uncover the conspiracy behind his downfall.",  tags:["Beautiful","Mystery","Award Winning"] },
  { title:"The King's Avatar",                   type:"donghua", genre:["Gaming","Action","Drama"],           status:"Completed", seasons:2,  episodes:40,   year:2017, rating:8.7, views:"28.9M", cover:"https://images.unsplash.com/photo-1635805737707-575885ab0820?w=400&q=80",  description:"A retired eSports legend restarts from scratch to reclaim his throne in a competitive MMORPG.",tags:["Gaming","Underdog Story","Strategic"] },
  { title:"Martial Universe",                    type:"donghua", genre:["Action","Fantasy","Adventure"],      status:"Completed", seasons:3,  episodes:60,   year:2018, rating:7.9, views:"22.4M", cover:"https://images.unsplash.com/photo-1596495578065-6e0763fa1178?w=400&q=80",  description:"Lin Dong discovers a mysterious stone talisman and embarks on a journey of martial cultivation.",tags:["Cultivation","Adventure","Action"] },
  { title:"Heaven Official's Blessing",          type:"donghua", genre:["Fantasy","Romance","Adventure"],     status:"Ongoing",   seasons:2,  episodes:22,   year:2020, rating:8.9, views:"19.2M", cover:"https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80",  description:"A disgraced god ascends for the third time and encounters a mysterious ghost king.",           tags:["Beautiful","Romance","Award Winning"] },
  { title:"A Record of a Mortal's Journey",      type:"donghua", genre:["Action","Fantasy","Adventure"],      status:"Ongoing",   seasons:4,  episodes:100,  year:2020, rating:8.2, views:"24.6M", cover:"https://images.unsplash.com/photo-1574169208507-84376144848b?w=400&q=80",  description:"A poor farmer boy enters the cultivation world through wit and perseverance alone.",            tags:["Cultivation","Slow Burn","Epic"] },
  { title:"Spirited Away",                       type:"movie",   genre:["Fantasy","Adventure","Family"],      status:"Completed", seasons:1,  episodes:1,    year:2001, rating:9.3, views:"62.0M", cover:"https://images.unsplash.com/photo-1610296669228-602fa827fc1f?w=400&q=80",  description:"A young girl enters a spirit world and must work to free herself and her transformed parents.", tags:["Masterpiece","Studio Ghibli","Timeless"] },
  { title:"Your Name",                           type:"movie",   genre:["Romance","Fantasy","Drama"],         status:"Completed", seasons:1,  episodes:1,    year:2016, rating:8.9, views:"47.3M", cover:"https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=80",  description:"Two strangers discover they are inexplicably body-swapping and begin to search for each other.", tags:["Masterpiece","Romance","Emotional"] },
  { title:"Demon Slayer: Mugen Train",           type:"movie",   genre:["Action","Adventure","Supernatural"], status:"Completed", seasons:1,  episodes:1,    year:2020, rating:8.3, views:"38.9M", cover:"https://images.unsplash.com/photo-1601850496218-f403a04d4c88?w=400&q=80",  description:"Tanjiro and friends join the Flame Hashira on a mission aboard the Infinity Train.",           tags:["Action","Emotional","Box Office Hit"] },
  { title:"Jujutsu Kaisen 0",                    type:"movie",   genre:["Action","Supernatural","Drama"],     status:"Completed", seasons:1,  episodes:1,    year:2021, rating:8.1, views:"29.4M", cover:"https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80",  description:"Yuta Okkotsu is haunted by his deceased childhood friend's powerful cursed spirit.",           tags:["Action","Prequel","Emotional"] },
  { title:"One Punch Man",                       type:"anime",   genre:["Action","Comedy","Superhero"],       status:"Ongoing",   seasons:2,  episodes:24,   year:2015, rating:8.8, views:"44.7M", cover:"https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=400&q=80",  description:"Saitama becomes so powerful he defeats any enemy with a single punch — and finds it boring.",  tags:["Hilarious","Action","Must Watch"] },
];

function seedMovies() {
  // Clear existing to avoid duplicates on re-run
 // db.run("DELETE FROM movie_tags");
  //db.run("DELETE FROM movie_genres");
 // db.run("DELETE FROM movies");

  let done = 0;
  MOVIES.forEach(m => {
    db.run(
      `INSERT INTO movies (title,type,status,seasons,episodes,year,rating,views,cover,banner,description,video_url)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [m.title, m.type, m.status, m.seasons, m.episodes, m.year, m.rating, m.views,
       m.cover, m.cover, m.description, DEMO_VIDEO],
      function(err) {
        if (err) { console.error("Movie error:", err.message); return; }
        const id = this.lastID;
        m.genre.forEach(g => {
          db.run("INSERT OR IGNORE INTO genres (name) VALUES (?)", [g]);
          db.get("SELECT id FROM genres WHERE name=?", [g], (e, row) => {
            if (row) db.run("INSERT OR IGNORE INTO movie_genres VALUES (?,?)", [id, row.id]);
          });
        });
        m.tags.forEach(t => {
          db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [t]);
          db.get("SELECT id FROM tags WHERE name=?", [t], (e, row) => {
            if (row) db.run("INSERT OR IGNORE INTO movie_tags VALUES (?,?)", [id, row.id]);
          });
        });
        done++;
        if (done === MOVIES.length) {
          console.log(`✅ Seeded ${done} movies (no duplicates)`);
          console.log("\n🚀 Done! Run: npm run dev\n");
          setTimeout(() => db.close(), 600);
        }
      }
    );
  });
}