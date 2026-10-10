import { handleHit } from "./counter.js";

// Sends every page request to one address, so Google only ever sees one copy:
// http:// -> https://, www. and the old workers.dev test address -> rusticchar.com.au,
// /gallery.html -> /gallery, /index.html -> /. All in a single permanent (301) hop.
// Only page requests run through here (see run_worker_first in wrangler.jsonc);
// images, video and fonts are served straight from static assets.
// /api/hit is the visit counter for the 79th client portal (see counter.js).
const MAIN_HOST = "rusticchar.com.au";
const OTHER_HOSTS = ["www.rusticchar.com.au", "rustic-char-website.calvingreely93.workers.dev"];
// Google Search Console ownership file. Must answer 200 at this exact address
// (static assets would forward it to the address without .html). Don't remove it.
const GOOGLE_VERIFY = "googlef342a07d479bb6c5.html";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = new URL(url);
    target.protocol = "https:";
    if (OTHER_HOSTS.includes(target.hostname)) target.hostname = MAIN_HOST;
    if (target.pathname === "/gallery.html") target.pathname = "/gallery";
    if (target.pathname === "/index.html") target.pathname = "/";
    if (target.href !== url.href) return Response.redirect(target.href, 301);
    if (url.pathname === "/api/hit") return handleHit(request, env);
    if (url.pathname === "/" + GOOGLE_VERIFY) {
      return new Response("google-site-verification: " + GOOGLE_VERIFY, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
