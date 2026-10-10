// Sends every page request to one address, so Google only ever sees one copy:
// http:// -> https://, www. and the old workers.dev test address -> rusticchar.com.au,
// /gallery.html -> /gallery, /index.html -> /. All in a single permanent (301) hop.
// Only page requests run through here (see run_worker_first in wrangler.jsonc);
// images, video and fonts are served straight from static assets.
const MAIN_HOST = "rusticchar.com.au";
const OTHER_HOSTS = ["www.rusticchar.com.au", "rustic-char-website.calvingreely93.workers.dev"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = new URL(url);
    target.protocol = "https:";
    if (OTHER_HOSTS.includes(target.hostname)) target.hostname = MAIN_HOST;
    if (target.pathname === "/gallery.html") target.pathname = "/gallery";
    if (target.pathname === "/index.html") target.pathname = "/";
    if (target.href !== url.href) return Response.redirect(target.href, 301);
    return env.ASSETS.fetch(request);
  },
};
