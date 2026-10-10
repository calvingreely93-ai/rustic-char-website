// Cookie-free visit counter for the 79th client portal (79th.au/portal).
// assets/site.js posts one small note per page view and per tap on Call,
// Uber Eats, Directions and the like to /api/hit; this writes it to the shared
// portal database (Cloudflare D1, bound as STATS_DB in wrangler.jsonc), tagged
// with this site's id. The portal reads it back from there.
// Nothing personal is stored: no cookies, no IP addresses. A visitor is a hash
// of IP + browser with a salt that is thrown away at the end of each day, so a
// person counts once per day but can never be traced back or followed.

const SITE = "rusticchar";
const MAIN_HOST = "rusticchar.com.au";
const TZ = "Australia/Sydney";
const PAGES = ["/", "/gallery"];
const TAPS = ["call", "ubereats", "directions", "catering", "email", "instagram", "review", "reviews"];
const BOT = /bot\b|bot\/|crawl|spider|slurp|lighthouse|headless|pagespeed|pingdom|uptime|monitor|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|curl|wget|python|node-fetch|axios|go-http/i;

// The same two tables the portal creates. Keep the two copies identical.
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS events (ts INTEGER NOT NULL, day TEXT NOT NULL, site TEXT NOT NULL, type TEXT NOT NULL, path TEXT, source TEXT, device TEXT, place TEXT, visitor TEXT)",
  "CREATE INDEX IF NOT EXISTS events_site_day ON events (site, day, type)",
  "CREATE TABLE IF NOT EXISTS salts (day TEXT PRIMARY KEY, salt TEXT NOT NULL)",
];

const enc = (s) => new TextEncoder().encode(s);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc(s)));
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

let ready = null;
function init(db) {
  ready ??= db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => { ready = null; throw e; });
  return ready;
}

let saltCache = { day: "", salt: "" };
async function saltFor(db, day) {
  if (saltCache.day === day) return saltCache.salt;
  const fresh = hex(crypto.getRandomValues(new Uint8Array(16)));
  const [, got] = await db.batch([
    db.prepare("INSERT OR IGNORE INTO salts (day, salt) VALUES (?, ?)").bind(day, fresh),
    db.prepare("SELECT salt FROM salts WHERE day = ?").bind(day),
    // Yesterday's salt is deleted, so old visitor hashes can never be matched again.
    db.prepare("DELETE FROM salts WHERE day < ?").bind(day),
  ]);
  saltCache = { day, salt: got.results[0].salt };
  return saltCache.salt;
}

function sourceOf(referrer, ua) {
  if (/Instagram/.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return "Facebook";
  let host = "";
  try { host = new URL(referrer).hostname.replace(/^www\./, ""); } catch { /* no referrer */ }
  if (!host) return "Direct";
  if (host === MAIN_HOST || host === "localhost" || host === "127.0.0.1") return null; // moving between our own pages
  const known = [
    [/(^|\.)google\./, "Google"], [/(^|\.)instagram\.com$/, "Instagram"], [/(^|\.)(facebook|fb)\.com$/, "Facebook"],
    [/(^|\.)bing\.com$/, "Bing"], [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"], [/(^|\.)yahoo\./, "Yahoo"],
    [/(^|\.)ubereats\.com$/, "Uber Eats"], [/(^|\.)visitnsw\.com$/, "Visit NSW"], [/(^|\.)discoverballina\.com\.au$/, "Discover Ballina"],
    [/(^|\.)tripadvisor\./, "Tripadvisor"], [/(^|\.)(chatgpt|openai)\.com$/, "ChatGPT"], [/(^|\.)79th\.au$/, "79th"],
  ];
  for (const [re, name] of known) if (re.test(host)) return name;
  return host.slice(0, 60);
}

function deviceOf(ua) {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return "Tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "Phone";
  return "Computer";
}

// A real visitor sends a few notes a minute at most. Anything far beyond that
// from one connection is someone flooding the counter, which would skew the
// numbers and use up the database's free daily writes the portal login needs.
// Kept in this Worker's memory: no database writes just to count the counting.
const PER_MINUTE = 30;
const recent = new Map();
function tooMany(ip) {
  const minute = Math.floor(Date.now() / 6e4);
  const key = minute + "|" + ip;
  const n = (recent.get(key) || 0) + 1;
  recent.set(key, n);
  if (recent.size > 5000) for (const k of recent.keys()) if (!k.startsWith(minute + "|")) recent.delete(k);
  return n > PER_MINUTE;
}

function placeOf(cf) {
  const city = cf?.city || "";
  const country = cf?.country || "";
  if (!city) return country === "AU" ? "Australia (town unknown)" : country || "Unknown";
  return country === "AU" ? city : `${city}, ${country}`;
}

export async function handleHit(request, env) {
  const done = new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  if (request.method !== "POST" || !env.STATS_DB) return done;
  const origin = request.headers.get("Origin") || "";
  if (origin && origin !== `https://${MAIN_HOST}` && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return done;
  const ua = request.headers.get("User-Agent") || "";
  if (!ua || BOT.test(ua)) return done;
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (tooMany(ip)) return done;

  let body;
  try {
    const text = await request.text();
    if (text.length > 2000) return done;
    body = JSON.parse(text);
  } catch { return done; }
  if (!body || typeof body !== "object") return done;
  const type = String(body.t || "");
  const path = String(body.p || "").replace(/\/index\.html$/, "/").replace(/\.html$/, "") || "/";
  if (!(type === "view" || TAPS.includes(type)) || !PAGES.includes(path)) return done;

  const db = env.STATS_DB;
  try {
    await init(db);
    const day = dayFmt.format(new Date());
    const visitor = (await sha256([await saltFor(db, day), SITE, ip, ua].join("|"))).slice(0, 16);
    const source = type === "view" ? sourceOf(String(body.r || ""), ua) : null;
    await db.prepare("INSERT INTO events (ts, day, site, type, path, source, device, place, visitor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(Date.now(), day, SITE, type, path, source, deviceOf(ua), placeOf(request.cf), visitor).run();
  } catch (e) {
    console.error("visit counter failed", e);
  }
  return done;
}
