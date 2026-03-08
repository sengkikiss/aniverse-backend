// src/api.js
// All API calls to the AniVerse backend
// Place this file in your React project's src/ folder

const BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

// ─── Token storage helpers ───
export const storage = {
  getToken:       ()    => localStorage.getItem("aniverse_token"),
  setToken:       (t)   => localStorage.setItem("aniverse_token", t),
  getRefresh:     ()    => localStorage.getItem("aniverse_refresh"),
  setRefresh:     (t)   => localStorage.setItem("aniverse_refresh", t),
  clear:          ()    => { localStorage.removeItem("aniverse_token"); localStorage.removeItem("aniverse_refresh"); },
};

// ─── Base fetch with auth header + auto-refresh ───
async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };

  const token = storage.getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(`${BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401) {
    const refresh = storage.getRefresh();
    if (refresh) {
      const r = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (r.ok) {
        const { accessToken } = await r.json();
        storage.setToken(accessToken);
        headers["Authorization"] = `Bearer ${accessToken}`;
        res = await fetch(`${BASE}${path}`, { ...options, headers });
      }
    }
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ═══════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════
export const auth = {
  register: (name, email, password) =>
    apiFetch("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),

  login: (email, password) =>
    apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  googleLogin: (googleId, email, name, avatar) =>
    apiFetch("/auth/google", { method: "POST", body: JSON.stringify({ googleId, email, name, avatar }) }),

  me: () => apiFetch("/auth/me"),

  logout: (refreshToken) =>
    apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }),

  // Call after login/register to persist tokens
  saveSession: ({ accessToken, refreshToken }) => {
    if (accessToken)  storage.setToken(accessToken);
    if (refreshToken) storage.setRefresh(refreshToken);
  },

  clearSession: () => storage.clear(),
};

// ═══════════════════════════════════════════════════
//  MOVIES
// ═══════════════════════════════════════════════════
export const movies = {
  // GET /api/movies?q=&type=&genre=&status=&sort=&order=&page=&limit=
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null && v !== "all" && v !== ""))
    ).toString();
    return apiFetch(`/movies${qs ? "?" + qs : ""}`);
  },

  get: (id) => apiFetch(`/movies/${id}`),

  // Admin: Create
  create: (data) =>
    apiFetch("/movies", { method: "POST", body: JSON.stringify(data) }),

  // Admin: Update
  update: (id, data) =>
    apiFetch(`/movies/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  // Admin: Delete
  delete: (id) =>
    apiFetch(`/movies/${id}`, { method: "DELETE" }),

  genres: () => apiFetch("/movies/genres"),
  tags:   () => apiFetch("/movies/tags"),
};

// ═══════════════════════════════════════════════════
//  USER (favorites, watchlist, profile)
// ═══════════════════════════════════════════════════
export const user = {
  getFavorites: ()    => apiFetch("/users/favorites"),
  addFavorite:  (id)  => apiFetch(`/users/favorites/${id}`, { method: "POST" }),
  removeFavorite:(id) => apiFetch(`/users/favorites/${id}`, { method: "DELETE" }),

  getWatchlist: ()    => apiFetch("/users/watchlist"),
  addWatchlist: (id)  => apiFetch(`/users/watchlist/${id}`, { method: "POST" }),
  removeWatchlist:(id)=> apiFetch(`/users/watchlist/${id}`, { method: "DELETE" }),

  updateProfile: (data) => apiFetch("/users/profile", { method: "PUT", body: JSON.stringify(data) }),
  changePassword:(current, next) =>
    apiFetch("/users/password", { method: "PUT", body: JSON.stringify({ currentPassword: current, newPassword: next }) }),
};

// ═══════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════
export const admin = {
  getUsers:    ()           => apiFetch("/users"),
  getUser:     (id)         => apiFetch(`/users/${id}`),
  changeRole:  (id, role)   => apiFetch(`/users/${id}/role`, { method: "PUT", body: JSON.stringify({ role }) }),
  deleteUser:  (id)         => apiFetch(`/users/${id}`, { method: "DELETE" }),
};