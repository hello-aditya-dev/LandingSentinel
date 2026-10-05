#!/usr/bin/env node
/**
 * LandingSentinel — development fixture server.
 *
 * A tiny deterministic HTTP server for verifying the REAL scanner engine
 * against controlled local endpoints (no live internet needed):
 *
 *   healthy 200 page (with trackers)    /healthy
 *   redirect -> healthy (absolute)      /redirect-healthy
 *   redirect -> healthy (relative)      /redirect-relative
 *   redirect preserving campaign params /redirect-utm-preserve
 *   redirect dropping campaign params   /redirect-utm-drop
 *   real 404                            /not-found
 *   real 500                            /server-error
 *   slow endpoint (times out)           /slow
 *   redirect loop                       /redirect-loop
 *   tracker-rich page                   /trackers
 *   tracker-absent page                 /no-trackers
 *   soft 404                            /soft-404
 *   noindex page                        /noindex
 *   UNSAFE redirect (blocked)           /redirect-unsafe
 *
 * Usage:
 *   npm run fixtures            # serves on http://127.0.0.1:4010
 *   npm run fixtures -- 4111    # custom port
 *
 * Then, with SCANNER_ALLOW_LOOPBACK_TARGETS=true in .env.local, import
 * sample-data/fixture-targets.csv in the app and run a real scan.
 *
 * DEVELOPMENT/TEST ONLY. Loopback targets are blocked by the scanner unless
 * that flag is set, and the flag must never be enabled in production
 * (see SECURITY.md). This server is not part of the production app.
 */
import { createServer } from "node:http";

const PORT = Number.parseInt(process.argv[2] ?? "4010", 10);
const HOST = "127.0.0.1";

const TRACKERS_HTML = `
<script async src="https://www.googletagmanager.com/gtag/js?id=G-DEMO1234"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-DEMO1234');</script>
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-DEMO1');</script>
<script>var googletag=googletag||{};googletag.cmd=googletag.cmd||[];(function(){var g=document.createElement('script');g.async=true;g.src='https://www.googletagmanager.com/gtag/js?id=AW-DEMO123';document.head.appendChild(g);})();</script>
<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','111111111111111');fbq('track','PageView');</script>
`;

function page(title, extra = "", trackers = true) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
${extra}
${trackers ? TRACKERS_HTML : ""}
</head>
<body>
<main>
<h1>${title}</h1>
<p>This is a synthetic fixture page served by scripts/dev-fixtures.mjs for LandingSentinel scanner verification. It contains enough text to avoid thin-content heuristics, describing a fictional product with several paragraphs of boilerplate copy so that content checks behave deterministically. The copy is deliberately dull: fixtures exist to exercise the engine, not to persuade anyone. Nothing here is real data.</p>
<a href="/cart">Shop now</a>
<form action="/subscribe" method="post"><input type="email" name="email" aria-label="Email" /><button type="submit">Subscribe</button></form>
</main>
</body>
</html>`;
}

/** @param {import("node:http").IncomingMessage} req */
function requestUrl(req) {
  const u = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  return u;
}

const server = createServer((req, res) => {
  const url = requestUrl(req);
  const path = url.pathname;

  const send = (status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
    res.end(body);
  };
  const redirect = (location, status = 302) => {
    res.writeHead(status, { location });
    res.end();
  };

  switch (path) {
    case "/healthy":
    case "/cart":
      return send(200, page("Healthy fixture page"));
    case "/redirect-healthy":
      return redirect(`http://${HOST}:${PORT}/healthy`);
    case "/redirect-relative":
      return redirect("/healthy");
    case "/redirect-utm-preserve": {
      const q = url.searchParams.toString();
      return redirect(`/healthy${q ? `?${q}` : ""}`);
    }
    case "/redirect-utm-drop":
      return redirect("/healthy");
    case "/not-found":
      return send(404, page("Not found", '<meta name="robots" content="noindex">'));
    case "/server-error":
      return send(500, "<html><body><h1>Internal server error</h1></body></html>");
    case "/slow":
      // Responds after 12s — beyond the default 10s scanner timeout.
      setTimeout(() => send(200, page("Slow fixture page")), 12_000);
      return;
    case "/redirect-loop":
      return redirect("/redirect-loop");
    case "/trackers":
      return send(200, page("Tracker-rich fixture page"));
    case "/no-trackers":
      return send(200, page("Tracker-absent fixture page", "", false));
    case "/soft-404":
      return send(200, page("Page not found", "", false).replace("<h1>Page not found</h1>", "<h1>Page not found</h1><p>Sorry, this page could not be found.</p>"));
    case "/noindex":
      return send(200, page("Noindex fixture page", '<meta name="robots" content="noindex, nofollow">'));
    case "/redirect-unsafe":
      // Cloud metadata endpoint — must ALWAYS be blocked by the scanner,
      // even with SCANNER_ALLOW_LOOPBACK_TARGETS=true.
      return redirect("http://169.254.169.254/latest/meta-data/");
    default:
      return send(404, "<html><body><h1>Unknown fixture</h1></body></html>");
  }
});

server.requestTimeout = 60_000;
server.headersTimeout = 65_000;

server.listen(PORT, HOST, () => {
  console.log(`LandingSentinel dev fixtures listening on http://${HOST}:${PORT}`);
  console.log("Import sample-data/fixture-targets.csv (SCANNER_ALLOW_LOOPBACK_TARGETS=true) and run a real scan.");
  console.log("DEVELOPMENT ONLY — never expose this server or enable the loopback flag in production.");
});
