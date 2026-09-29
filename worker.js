// Sends anyone who arrives on plain http:// to the secure https:// version.
// Only page requests run through here (see run_worker_first in wrangler.jsonc);
// images, video and fonts are served straight from static assets.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
