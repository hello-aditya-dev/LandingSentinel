import { createServer, type Server } from "node:http";

/**
 * Deterministic fixture HTTP server for scanner integration tests.
 *
 * Serves on 127.0.0.1 with an ephemeral port. Mirrors the manual development
 * fixture server (scripts/dev-fixtures.mjs) — keep the route table in sync.
 * The scanner reaches these endpoints only when
 * SCANNER_ALLOW_LOOPBACK_TARGETS is enabled (test-only escape hatch; every
 * other SSRF rule stays enforced, including the cloud-metadata block used by
 * the /redirect-unsafe case).
 */

const TRACKERS_HTML = `
<script async src="https://www.googletagmanager.com/gtag/js?id=G-AB12CD34EF"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-AB12CD34EF');</script>
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-AB12CD');</script>
<script>gtag('config','AW-123456789');</script>
<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','1234567890123456');fbq('track','PageView');</script>
`;

function page(title: string, extra = "", trackers = true): string {
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
<p>This is a synthetic fixture page for LandingSentinel scanner verification. It contains enough text to avoid thin-content heuristics, describing a fictional product with several paragraphs of deliberately dull boilerplate copy so that content checks behave deterministically. Nothing here is real data and no real campaign spend is associated with it.</p>
<a href="/cart"><span>Shop now</span></a>
<form action="/subscribe" method="post"><input type="email" name="email" aria-label="Email"><button type="submit">Subscribe</button></form>
</main>
</body>
</html>`;
}

export function createFixtureServer(opts: { slowMs?: number } = {}): Server {
  const slowMs = opts.slowMs ?? 6_000;

  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    const query = url.searchParams.toString();

    const send = (status: number, body: string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
      res.end(body);
    };
    const redirect = (location: string, status = 302) => {
      res.writeHead(status, { location });
      res.end();
    };

    switch (path) {
      case "/healthy":
      case "/cart":
        return send(200, page("Healthy fixture page"));
      case "/redirect-healthy":
        // Absolute Location, campaign parameters preserved.
        return redirect(`http://${req.headers.host}/healthy${query ? `?${query}` : ""}`);
      case "/redirect-relative":
        // Relative Location resolved against the current URL, params preserved.
        return redirect(`/healthy${query ? `?${query}` : ""}`);
      case "/redirect-utm-preserve":
        return redirect(`/healthy${query ? `?${query}` : ""}`);
      case "/redirect-utm-drop":
        // Redirect that strips every campaign parameter.
        return redirect("/healthy");
      case "/not-found":
        return send(404, page("Not found"));
      case "/server-error":
        return send(500, "<html><body><h1>Internal server error</h1></body></html>");
      case "/slow":
        // Responds after slowMs — beyond the scanner timeout (retried once).
        setTimeout(() => send(200, page("Slow fixture page")), slowMs);
        return;
      case "/redirect-loop":
        return redirect("/redirect-loop");
      case "/trackers":
        return send(200, page("Tracker-rich fixture page"));
      case "/no-trackers":
        return send(200, page("Tracker-absent fixture page", "", false));
      case "/soft-404":
        return send(200, page("Page not found", "", false));
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
}
