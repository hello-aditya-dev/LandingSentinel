/**
 * Synthetic demo dataset — Northstar Outfitters (fictional).
 *
 * DETERMINISTIC FIXTURES, clearly labelled as synthetic everywhere they are
 * shown. The fixture scanner produces PageFetchResult objects that flow
 * through the SAME check engine as real scans, so demo behaviour matches
 * production behaviour exactly. No real website is ever contacted in demo
 * mode. Fixture results carry metadata marking them as synthetic.
 *
 * Numbers (verify in seed output):
 *   32 campaign rows · 22 destinations · £84,260 total spend
 *   Critical destinations: 4 · £11,840
 *   Warning findings: 9 · Healthy destinations: 10
 */

import type { PageFetchResult, RedirectHopDraft } from "./types";

export type DemoCampaignRow = {
  platform: "meta" | "google" | "tiktok" | "linkedin" | "other";
  campaignName: string;
  adGroupName?: string;
  originalUrl: string;
  spendMinor: number;
  batch: "google-ads-sample.csv" | "meta-ads-sample.csv" | "paid-media-mixed-sample.csv";
};

export type DemoDestination = {
  normalizedKey: string;
  representativeUrl: string;
  hostname: string;
  pathname: string;
  rows: DemoCampaignRow[];
  /** Live fixture: what the scan produces. */
  live: FixtureSpec;
  /** After-fixes fixture: the synthetic "remediated" state. */
  fixed: FixtureSpec;
};

/**
 * Fixture specification: everything the check engine needs, in the same
 * shape a live fetch would produce.
 */
export type FixtureSpec = {
  status?: number;
  contentType?: string;
  responseTimeMs?: number;
  html?: string;
  redirects?: { to: string; statusCode: number }[];
  error?:
    | "DNS_ERROR"
    | "TLS_ERROR"
    | "CONNECTION_FAILURE"
    | "TIMEOUT"
    | "REDIRECT_LOOP"
    | "TOO_MANY_REDIRECTS"
    | "BLOCKED_URL";
};

const GBP = "GBP";

/* --- synthetic HTML builders ---------------------------------- */

function page(opts: {
  title: string;
  h1: string;
  body?: string;
  trackers?: string[];
  noindex?: boolean;
  cta?: string | false;
  form?: boolean;
  metaDescription?: boolean;
}): string {
  const trackers = (opts.trackers ?? []).join("\n    ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${opts.title}</title>
  ${opts.metaDescription === false ? "" : '<meta name="description" content="Northstar Outfitters — outdoor gear and apparel.">'}
  ${opts.noindex ? '<meta name="robots" content="noindex, follow">' : ""}
  ${trackers}
</head>
<body>
  <header><a href="/">Northstar Outfitters</a></header>
  <main>
    <h1>${opts.h1}</h1>
    <p>${opts.body ?? "Trail-tested outdoor equipment and apparel for every season — from lightweight summer layers to four-season shelters. Free returns within 60 days, free repairs for life, and a workshop that keeps hard-used gear out of landfill. Every product is field-tested by our guides before it earns a place in the catalog."}</p>
    ${opts.cta === false ? "" : `<a class="btn" href="/cart">Shop now</a>`}
    ${opts.form ? '<form action="/subscribe" method="post"><input type="email" name="email"><button type="submit">Subscribe</button></form>' : ""}
  </main>
</body>
</html>`;
}

const GA4 = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-4NXSTAR01"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-4NXSTAR01');</script>`;
const GTM = `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-NXSTAR2');</script>`;
const GADS = `<script async src="https://www.googletagmanager.com/gtag/js?id=AW-10987654321"></script>
    <script>gtag('config','AW-10987654321');</script>`;
const META_PIXEL = `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','119876543210987');fbq('track','PageView');</script>`;
const TIKTOK_PIXEL = `<script>!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('C9N8STAR0101');ttq.page();}(window,document,'ttq');</script>`;
const LINKEDIN_TAG = `<script type="text/javascript">_linkedin_partner_id = "4829103";window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];window._linkedin_data_partner_ids.push(_linkedin_partner_id);</script>
    <script type="text/javascript">(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s);})(window.lintrk);</script>`;

/* --- the dataset ----------------------------------------------- */

export const DEMO_CLIENT_NAME = "Northstar Outfitters — Synthetic Demo";
export const DEMO_CURRENCY = GBP;
export const DEMO_TOTAL_SPEND_MINOR = 84_260_00; // £84,260.00

export const DEMO_DESTINATIONS: DemoDestination[] = [
  /* ---- CRITICAL (4 destinations · £11,840) ---- */
  {
    normalizedKey: "shop.northstar-outfitters.test/summer-sale",
    representativeUrl: "https://shop.northstar-outfitters.test/summer-sale",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/summer-sale",
    rows: [
      { platform: "meta", campaignName: "Prospecting — Summer Sale", adGroupName: "Broad — Interests", originalUrl: "https://shop.northstar-outfitters.test/summer-sale?utm_source=meta&utm_campaign=summer-sale&utm_content=carousel-a", spendMinor: 1700_00, batch: "meta-ads-sample.csv" },
      { platform: "meta", campaignName: "Retargeting — Summer Sale", adGroupName: "30d Site Visitors", originalUrl: "https://shop.northstar-outfitters.test/summer-sale?utm_source=meta&utm_campaign=summer-sale&utm_content=static-b", spendMinor: 2200_00, batch: "meta-ads-sample.csv" },
      { platform: "meta", campaignName: "Adv+ Broad — Summer", adGroupName: "Adv+ Auto", originalUrl: "https://shop.northstar-outfitters.test/summer-sale?utm_source=meta&utm_campaign=summer-sale&utm_content=video-c", spendMinor: 900_00, batch: "meta-ads-sample.csv" },
    ],
    live: {
      status: 200,
      responseTimeMs: 940,
      html: page({
        title: "Summer Sale — Northstar Outfitters",
        h1: "Summer Sale: up to 40% off",
        body: "Seasonal reductions across lightweight layers, sun hats, trail packs and camp footwear — up to 40% while stock lasts. Members get early access to reductions, and every order ships with a free returns label. Browse the full sale range before sizes run out.",
        cta: false,
      }),
    },
    fixed: {
      status: 200,
      responseTimeMs: 610,
      html: page({
        title: "Summer Sale — Northstar Outfitters",
        h1: "Summer Sale: up to 40% off",
        body: "Seasonal reductions across lightweight layers, sun hats, trail packs and camp footwear — up to 40% while stock lasts. Members get early access to reductions, and every order ships with a free returns label. Browse the full sale range before sizes run out.",
        trackers: [META_PIXEL],
      }),
    },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/products/shoes",
    representativeUrl: "https://shop.northstar-outfitters.test/products/shoes",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/products/shoes",
    rows: [
      { platform: "meta", campaignName: "Spring Prospecting", adGroupName: "Lookalike 1%", originalUrl: "https://shop.northstar-outfitters.test/products/shoes?utm_source=meta&utm_campaign=spring-sale", spendMinor: 1750_00, batch: "meta-ads-sample.csv" },
      { platform: "meta", campaignName: "Spring Retargeting", adGroupName: "Cart Abandoners 7d", originalUrl: "https://shop.northstar-outfitters.test/products/shoes?utm_source=meta&utm_campaign=spring-sale", spendMinor: 1500_00, batch: "meta-ads-sample.csv" },
    ],
    live: {
      status: 200,
      responseTimeMs: 1120,
      redirects: [{ to: "https://shop.northstar-outfitters.test/collections/shoes", statusCode: 301 }],
      html: page({
        title: "Trail Shoes & Approach — Northstar Outfitters",
        h1: "Trail shoes",
        body: "Grip-first trail shoes for wet rock, dry scree and everything between. Tested across 400 km of mixed terrain by our guide team, with a 60-day wear-in window and lifetime resoling at the workshop. Free exchanges on sizing, and members collect trip credits on every pair.",
        trackers: [META_PIXEL],
      }),
    },
    fixed: {
      status: 200,
      responseTimeMs: 780,
      redirects: [{ to: "https://shop.northstar-outfitters.test/collections/shoes?utm_source=meta&utm_campaign=spring-sale", statusCode: 301 }],
      html: page({
        title: "Trail Shoes & Approach — Northstar Outfitters",
        h1: "Trail shoes",
        body: "Grip-first trail shoes for wet rock, dry scree and everything between. Tested across 400 km of mixed terrain by our guide team, with a 60-day wear-in window and lifetime resoling at the workshop. Free exchanges on sizing, and members collect trip credits on every pair.",
        trackers: [META_PIXEL],
      }),
    },
  },
  {
    normalizedKey: "northstar-outfitters.test/old-offer",
    representativeUrl: "https://northstar-outfitters.test/old-offer",
    hostname: "northstar-outfitters.test",
    pathname: "/old-offer",
    rows: [
      { platform: "google", campaignName: "Brand — Exact", adGroupName: "Exact — Old Offer", originalUrl: "https://northstar-outfitters.test/old-offer?utm_source=google&utm_campaign=brand", spendMinor: 890_00, batch: "google-ads-sample.csv" },
      { platform: "meta", campaignName: "Legacy Offers — Prospecting", originalUrl: "https://northstar-outfitters.test/old-offer?utm_source=meta&utm_campaign=legacy", spendMinor: 800_00, batch: "meta-ads-sample.csv" },
      { platform: "tiktok", campaignName: "Old Offer Remarketing", originalUrl: "https://northstar-outfitters.test/old-offer?utm_source=tiktok&utm_campaign=legacy", spendMinor: 500_00, batch: "paid-media-mixed-sample.csv" },
    ],
    live: {
      status: 404,
      responseTimeMs: 480,
      html: `<!DOCTYPE html><html lang="en"><head><title>Page not found — Northstar Outfitters</title></head><body><main><h1>Page not found</h1><p>The page you requested does not exist.</p></main></body></html>`,
    },
    fixed: {
      status: 200,
      responseTimeMs: 520,
      html: page({
        title: "Current Offers — Northstar Outfitters",
        h1: "Current offers",
        body: "This season's promotions across jackets, tents and accessories — with up to 30% off selected colourways and a further member discount applied at checkout. Every promotion item carries the standard 60-day wear-in window, free returns and free lifetime repairs at the workshop.",
        trackers: [GA4, META_PIXEL, TIKTOK_PIXEL],
      }),
    },
  },
  {
    normalizedKey: "spring-clearance.northstar-outfitters.test",
    representativeUrl: "https://spring-clearance.northstar-outfitters.test/",
    hostname: "spring-clearance.northstar-outfitters.test",
    pathname: "/",
    rows: [
      { platform: "google", campaignName: "Clearance — Shopping", adGroupName: "Clearance Feed", originalUrl: "https://spring-clearance.northstar-outfitters.test/?utm_source=google&utm_campaign=clearance", spendMinor: 1600_00, batch: "google-ads-sample.csv" },
    ],
    live: { error: "DNS_ERROR" },
    fixed: {
      status: 200,
      responseTimeMs: 690,
      html: page({
        title: "Spring Clearance — Northstar Outfitters",
        h1: "Spring clearance",
        body: "Last season's gear at clearance prices — limited sizes remaining across shelters, sleep systems and insulated layers. Clearance items carry the same 60-day wear-in window and free lifetime repairs as full-price stock, and members collect trip credits on every clearance order.",
        trackers: [GA4, GADS],
      }),
    },
  },

  /* ---- WARNING destinations (8 · 9 warning findings) ---- */
  {
    normalizedKey: "northstar-outfitters.test/new-arrivals",
    representativeUrl: "https://northstar-outfitters.test/new-arrivals",
    hostname: "northstar-outfitters.test",
    pathname: "/new-arrivals",
    rows: [
      { platform: "google", campaignName: "New Arrivals — PMax", adGroupName: "PMax — Assets", originalUrl: "https://northstar-outfitters.test/new-arrivals?utm_source=google&utm_campaign=spring-arrivals&utm_content=hero-variant", spendMinor: 2200_00, batch: "google-ads-sample.csv" },
      { platform: "google", campaignName: "New Arrivals — Search", adGroupName: "Non-brand", originalUrl: "https://northstar-outfitters.test/new-arrivals?utm_source=google&utm_campaign=spring-arrivals&utm_content=list-variant", spendMinor: 1920_00, batch: "google-ads-sample.csv" },
    ],
    live: {
      status: 200,
      responseTimeMs: 1340,
      redirects: [{ to: "https://www.northstar-outfitters.test/new-arrivals?utm_source=google&utm_campaign=spring-arrivals", statusCode: 301 }],
      html: page({
        title: "New Arrivals — Northstar Outfitters",
        h1: "New arrivals",
        body: "The latest shells, insulation and packs, straight from the design bench. Field notes from our guide team, a 60-day wear-in window on everything, and free lifetime repairs at the workshop. Members see new arrivals a week early and collect trip credits on every order placed.",
        trackers: [GA4],
      }),
    },
    fixed: {
      status: 200,
      responseTimeMs: 860,
      html: page({
        title: "New Arrivals — Northstar Outfitters",
        h1: "New arrivals",
        body: "The latest shells, insulation and packs, straight from the design bench. Field notes from our guide team, a 60-day wear-in window on everything, and free lifetime repairs at the workshop. Members see new arrivals a week early and collect trip credits on every order placed.",
        trackers: [GA4, GADS],
      }),
    },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/winter-knitwear",
    representativeUrl: "https://shop.northstar-outfitters.test/winter-knitwear",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/winter-knitwear",
    rows: [
      { platform: "meta", campaignName: "Winter Knitwear — Retargeting", adGroupName: "14d ViewContent", originalUrl: "https://shop.northstar-outfitters.test/winter-knitwear?utm_source=meta&utm_campaign=winter-knitwear", spendMinor: 3980_00, batch: "meta-ads-sample.csv" },
    ],
    live: {
      status: 200,
      responseTimeMs: 1010,
      html: page({
        title: "Merino Knitwear — Northstar Outfitters",
        h1: "Merino knitwear",
        body: "This item is currently out of stock. Register your email and we will tell you when it returns. Our workshop can also source last-season colourways and repair existing pieces — send yours in with a free returns label and we will return it road-ready within ten working days.",
        trackers: [META_PIXEL],
        cta: false,
      }),
    },
    fixed: {
      status: 200,
      responseTimeMs: 720,
      html: page({
        title: "Merino Knitwear — Northstar Outfitters",
        h1: "Merino knitwear",
        body: "Mid-weight merino layers, back in stock in every colourway. Machine washable, odour-resistant and tested across four seasons of daily wear. Members collect trip credits on every order, and repairs at the workshop are free for the life of each piece.",
        trackers: [META_PIXEL],
      }),
    },
  },
  {
    normalizedKey: "northstar-outfitters.test/gift-guide",
    representativeUrl: "https://northstar-outfitters.test/gift-guide",
    hostname: "northstar-outfitters.test",
    pathname: "/gift-guide",
    rows: [
      { platform: "meta", campaignName: "Gift Guide — Prospecting", adGroupName: "Interests — Gifting", originalUrl: "https://northstar-outfitters.test/gift-guide?utm_source=meta&utm_campaign=gift-guide", spendMinor: 1600_00, batch: "meta-ads-sample.csv" },
      { platform: "linkedin", campaignName: "Gift Guide — Sponsored Content", adGroupName: "Function — Outdoor", originalUrl: "https://northstar-outfitters.test/gift-guide?utm_source=linkedin&utm_campaign=gift-guide", spendMinor: 1040_00, batch: "paid-media-mixed-sample.csv" },
    ],
    live: {
      status: 200,
      responseTimeMs: 880,
      html: `<!DOCTYPE html><html lang="en"><head><title>Page not found — Northstar Outfitters</title>${GTM}${LINKEDIN_TAG}</head><body><main><h1>Page not found</h1><p>Sorry — this content unavailable. The gift guide has moved.</p></main></body></html>`,
    },
    fixed: {
      status: 200,
      responseTimeMs: 700,
      html: page({
        title: "Gift Guide — Northstar Outfitters",
        h1: "The 2025 gift guide",
        body: "Field-tested gift picks for every kind of outdoors person, from stocking-fillers to four-season shelters. Each pick includes why it earned its place, who it suits and how it survives a full season of hard use — with free returns on everything in the guide.",
        trackers: [GTM, LINKEDIN_TAG, META_PIXEL],
      }),
    },
  },
  {
    normalizedKey: "northstar-outfitters.test/about",
    representativeUrl: "https://northstar-outfitters.test/about",
    hostname: "northstar-outfitters.test",
    pathname: "/about",
    rows: [
      { platform: "google", campaignName: "Brand — About Page", adGroupName: "Exact", originalUrl: "https://northstar-outfitters.test/about?utm_source=google&utm_campaign=brand", spendMinor: 980_00, batch: "google-ads-sample.csv" },
    ],
    live: {
      status: 200,
      responseTimeMs: 640,
      html: page({
        title: "About Northstar Outfitters",
        h1: "Built for the long trail",
        body: "We design equipment for multi-day trips, wet weather and honest wear. Our repair service keeps gear out of landfill, our guides test every product in the field before it is catalogued, and our supply partners are audited annually. We have built for the long trail since 1998.",
        trackers: [GA4],
        noindex: true,
      }),
    },
    fixed: {
      status: 200,
      responseTimeMs: 600,
      html: page({
        title: "About Northstar Outfitters",
        h1: "Built for the long trail",
        body: "We design equipment for multi-day trips, wet weather and honest wear. Our repair service keeps gear out of landfill, our guides test every product in the field before it is catalogued, and our supply partners are audited annually. We have built for the long trail since 1998.",
        trackers: [GA4],
      }),
    },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/gear-guide",
    representativeUrl: "https://shop.northstar-outfitters.test/gear-guide",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/gear-guide",
    rows: [
      { platform: "google", campaignName: "Gear Guide — Search", adGroupName: "Non-brand", originalUrl: "https://shop.northstar-outfitters.test/gear-guide?utm_source=google&utm_campaign=gear-guide", spendMinor: 2450_00, batch: "google-ads-sample.csv" },
    ],
    live: {
      status: 403,
      responseTimeMs: 780,
      contentType: "text/html; charset=utf-8",
      html: "",
    },
    fixed: {
      status: 200,
      responseTimeMs: 830,
      html: page({
        title: "Gear Guides — Northstar Outfitters",
        h1: "Gear guides",
        body: "In-depth buying guides for tents, sleep systems and insulation — written by our guide team after real trips, not rewritten spec sheets. Each guide covers weight targets, weather windows and repairability, with a printable checklist for your next resupply.",
        trackers: [GA4, GADS],
      }),
    },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/trail-series",
    representativeUrl: "https://shop.northstar-outfitters.test/trail-series",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/trail-series",
    rows: [
      { platform: "meta", campaignName: "Trail Series — Video", adGroupName: "Video — Thru-hike", originalUrl: "https://shop.northstar-outfitters.test/trail-series?utm_source=meta&utm_campaign=trail-series", spendMinor: 3200_00, batch: "meta-ads-sample.csv" },
      { platform: "tiktok", campaignName: "Trail Series — Spark Ads", adGroupName: "Spark — Creators", originalUrl: "https://shop.northstar-outfitters.test/trail-series?utm_source=tiktok&utm_campaign=trail-series", spendMinor: 2530_00, batch: "paid-media-mixed-sample.csv" },
    ],
    live: {
      status: 200,
      responseTimeMs: 4800,
      html: page({
        title: "Trail Series — Northstar Outfitters",
        h1: "The Trail Series",
        body: "Ultralight shelters and sleep systems engineered for thru-hikes. A full carbon pole set, 900-fill hydrophobic down and a pack weight under 900 g for the shelter system. Field-repaired free for life at our workshop, with a 60-day wear-in window and free returns.",
        trackers: [META_PIXEL, TIKTOK_PIXEL],
      }),
    },
    fixed: {
      status: 200,
      responseTimeMs: 720,
      html: page({
        title: "Trail Series — Northstar Outfitters",
        h1: "The Trail Series",
        body: "Ultralight shelters and sleep systems engineered for thru-hikes. A full carbon pole set, 900-fill hydrophobic down and a pack weight under 900 g for the shelter system. Field-repaired free for life at our workshop, with a 60-day wear-in window and free returns.",
        trackers: [META_PIXEL, TIKTOK_PIXEL],
      }),
    },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/festival-collection",
    representativeUrl: "https://shop.northstar-outfitters.test/festival-collection",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/festival-collection",
    rows: [
      { platform: "google", campaignName: "Festival — PMax", adGroupName: "PMax — Assets", originalUrl: "https://shop.northstar-outfitters.test/festival-collection?utm_source=google&utm_campaign=festival", spendMinor: 3600_00, batch: "google-ads-sample.csv" },
      { platform: "google", campaignName: "Festival — Search", adGroupName: "Non-brand", originalUrl: "https://shop.northstar-outfitters.test/festival-collection?utm_source=google&utm_campaign=festival", spendMinor: 3300_00, batch: "google-ads-sample.csv" },
    ],
    live: {
      status: 200,
      responseTimeMs: 1150,
      html: page({
        title: "Festival Collection — Northstar Outfitters",
        h1: "Festival collection",
        body: "Packable layers, head torches and dry bags for festival weekends — everything packs into one daypack. Field-tested at three festivals this season, with a printable packing checklist, a 60-day wear-in window and free returns on everything in the collection.",
        trackers: [GTM],
      }),
    },
    fixed: {
      status: 200,
      responseTimeMs: 900,
      html: page({
        title: "Festival Collection — Northstar Outfitters",
        h1: "Festival collection",
        body: "Packable layers, head torches and dry bags for festival weekends — everything packs into one daypack. Field-tested at three festivals this season, with a printable packing checklist, a 60-day wear-in window and free returns on everything in the collection.",
        trackers: [GTM, GA4, GADS],
      }),
    },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/loyalty-signup",
    representativeUrl: "https://shop.northstar-outfitters.test/loyalty-signup",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/loyalty-signup",
    rows: [
      { platform: "linkedin", campaignName: "Loyalty Signup — Lead Gen", adGroupName: "Lead Form — Members", originalUrl: "https://shop.northstar-outfitters.test/loyalty-signup?utm_source=linkedin&utm_campaign=loyalty", spendMinor: 1240_00, batch: "paid-media-mixed-sample.csv" },
    ],
    live: {
      status: 200,
      responseTimeMs: 820,
      html: `<!DOCTYPE html><html lang="en"><head><title></title>${LINKEDIN_TAG}</head><body><main><h1>Join Northstar Basecamp</h1><p>Members get early access to drops, repairs at cost, trip credits and invitations to guided trail days. Membership is free, your data stays with us and is never resold, and every membership includes a welcome credit against your first order. Join now to collect yours.</p><form action="/join" method="post"><input type="email" name="email"><button type="submit">Join now</button></form></main></body></html>`,
    },
    fixed: {
      status: 200,
      responseTimeMs: 700,
      html: page({
        title: "Join Northstar Basecamp — Loyalty",
        h1: "Join Northstar Basecamp",
        body: "Members get early access to drops, repairs at cost, trip credits and invitations to guided trail days. Membership is free, your data stays with us and is never resold, and every membership includes a welcome credit against your first order. Join now to collect yours.",
        trackers: [LINKEDIN_TAG],
        form: true,
      }),
    },
  },

  /* ---- HEALTHY destinations (10 · £44,380) ---- */
  {
    normalizedKey: "shop.northstar-outfitters.test",
    representativeUrl: "https://shop.northstar-outfitters.test/",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/",
    rows: [
      { platform: "meta", campaignName: "Always On — Prospecting", adGroupName: "Broad", originalUrl: "https://shop.northstar-outfitters.test/?utm_source=meta&utm_campaign=always-on", spendMinor: 7500_00, batch: "meta-ads-sample.csv" },
      { platform: "meta", campaignName: "Always On — Retargeting", adGroupName: "60d Visitors", originalUrl: "https://shop.northstar-outfitters.test/?utm_source=meta&utm_campaign=always-on", spendMinor: 4250_00, batch: "meta-ads-sample.csv" },
    ],
    live: {
      status: 200,
      responseTimeMs: 780,
      html: page({
        title: "Northstar Outfitters — Outdoor Gear & Apparel",
        h1: "Equipment for the long trail",
        trackers: [GA4, META_PIXEL],
      }),
    },
    fixed: { status: 200, responseTimeMs: 760, html: page({ title: "Northstar Outfitters — Outdoor Gear & Apparel", h1: "Equipment for the long trail", trackers: [GA4, META_PIXEL] }) },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/catalog",
    representativeUrl: "https://shop.northstar-outfitters.test/catalog",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/catalog",
    rows: [
      { platform: "google", campaignName: "Catalog — Shopping", adGroupName: "Full Catalog", originalUrl: "https://shop.northstar-outfitters.test/catalog?utm_source=google&utm_campaign=catalog", spendMinor: 4320_00, batch: "google-ads-sample.csv" },
    ],
    live: { status: 200, responseTimeMs: 950, html: page({ title: "Catalog — Northstar Outfitters", h1: "Full catalog", trackers: [GA4, GADS] }) },
    fixed: { status: 200, responseTimeMs: 900, html: page({ title: "Catalog — Northstar Outfitters", h1: "Full catalog", trackers: [GA4, GADS] }) },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/journal",
    representativeUrl: "https://shop.northstar-outfitters.test/journal",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/journal",
    rows: [
      { platform: "google", campaignName: "Journal — Discovery", adGroupName: "Custom Intent", originalUrl: "https://shop.northstar-outfitters.test/journal?utm_source=google&utm_campaign=journal", spendMinor: 2180_00, batch: "google-ads-sample.csv" },
    ],
    live: { status: 200, responseTimeMs: 700, html: page({ title: "The Journal — Northstar Outfitters", h1: "Field notes", trackers: [GA4] }) },
    fixed: { status: 200, responseTimeMs: 680, html: page({ title: "The Journal — Northstar Outfitters", h1: "Field notes", trackers: [GA4] }) },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/support",
    representativeUrl: "https://shop.northstar-outfitters.test/support",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/support",
    rows: [
      { platform: "google", campaignName: "Support — Brand", adGroupName: "Exact", originalUrl: "https://shop.northstar-outfitters.test/support?utm_source=google&utm_campaign=brand", spendMinor: 1560_00, batch: "google-ads-sample.csv" },
    ],
    live: { status: 200, responseTimeMs: 540, html: page({ title: "Support — Northstar Outfitters", h1: "Help centre", trackers: [GA4] }) },
    fixed: { status: 200, responseTimeMs: 520, html: page({ title: "Support — Northstar Outfitters", h1: "Help centre", trackers: [GA4] }) },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/contact",
    representativeUrl: "https://shop.northstar-outfitters.test/contact",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/contact",
    rows: [
      { platform: "linkedin", campaignName: "Contact — Lead Gen", adGroupName: "Lead Form", originalUrl: "https://shop.northstar-outfitters.test/contact?utm_source=linkedin&utm_campaign=contact", spendMinor: 990_00, batch: "paid-media-mixed-sample.csv" },
    ],
    live: { status: 200, responseTimeMs: 610, html: page({ title: "Contact — Northstar Outfitters", h1: "Talk to us", trackers: [LINKEDIN_TAG], form: true }) },
    fixed: { status: 200, responseTimeMs: 590, html: page({ title: "Contact — Northstar Outfitters", h1: "Talk to us", trackers: [LINKEDIN_TAG], form: true }) },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/gift-cards",
    representativeUrl: "https://shop.northstar-outfitters.test/gift-cards",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/gift-cards",
    rows: [
      { platform: "meta", campaignName: "Gift Cards — Retargeting", adGroupName: "90d Purchasers", originalUrl: "https://shop.northstar-outfitters.test/gift-cards?utm_source=meta&utm_campaign=gift-cards", spendMinor: 3480_00, batch: "meta-ads-sample.csv" },
    ],
    live: { status: 200, responseTimeMs: 830, html: page({ title: "Gift Cards — Northstar Outfitters", h1: "Gift cards", trackers: [GTM, META_PIXEL] }) },
    fixed: { status: 200, responseTimeMs: 810, html: page({ title: "Gift Cards — Northstar Outfitters", h1: "Gift cards", trackers: [GTM, META_PIXEL] }) },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/mens",
    representativeUrl: "https://shop.northstar-outfitters.test/mens",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/mens",
    rows: [
      { platform: "google", campaignName: "Mens — Shopping", adGroupName: "Mens Feed", originalUrl: "https://shop.northstar-outfitters.test/mens?utm_source=google&utm_campaign=mens", spendMinor: 5240_00, batch: "google-ads-sample.csv" },
    ],
    live: { status: 200, responseTimeMs: 1020, html: page({ title: "Mens — Northstar Outfitters", h1: "Mens collection", trackers: [GA4, GADS] }) },
    fixed: { status: 200, responseTimeMs: 980, html: page({ title: "Mens — Northstar Outfitters", h1: "Mens collection", trackers: [GA4, GADS] }) },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/womens",
    representativeUrl: "https://shop.northstar-outfitters.test/womens",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/womens",
    rows: [
      { platform: "meta", campaignName: "Womens — Prospecting", adGroupName: "Interests — Hiking", originalUrl: "https://shop.northstar-outfitters.test/womens?utm_source=meta&utm_campaign=womens", spendMinor: 8120_00, batch: "meta-ads-sample.csv" },
    ],
    live: { status: 200, responseTimeMs: 890, html: page({ title: "Womens — Northstar Outfitters", h1: "Womens collection", trackers: [META_PIXEL, GA4] }) },
    fixed: { status: 200, responseTimeMs: 870, html: page({ title: "Womens — Northstar Outfitters", h1: "Womens collection", trackers: [META_PIXEL, GA4] }) },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/accessories",
    representativeUrl: "https://shop.northstar-outfitters.test/accessories",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/accessories",
    rows: [
      { platform: "tiktok", campaignName: "Accessories — Prospecting", adGroupName: "Broad", originalUrl: "https://shop.northstar-outfitters.test/accessories?utm_source=tiktok&utm_campaign=accessories", spendMinor: 4090_00, batch: "paid-media-mixed-sample.csv" },
    ],
    live: { status: 200, responseTimeMs: 760, html: page({ title: "Accessories — Northstar Outfitters", h1: "Accessories", trackers: [TIKTOK_PIXEL, GA4] }) },
    fixed: { status: 200, responseTimeMs: 740, html: page({ title: "Accessories — Northstar Outfitters", h1: "Accessories", trackers: [TIKTOK_PIXEL, GA4] }) },
  },
  {
    normalizedKey: "shop.northstar-outfitters.test/returns",
    representativeUrl: "https://shop.northstar-outfitters.test/returns",
    hostname: "shop.northstar-outfitters.test",
    pathname: "/returns",
    rows: [
      { platform: "google", campaignName: "Returns — Brand", adGroupName: "Exact", originalUrl: "https://shop.northstar-outfitters.test/returns?utm_source=google&utm_campaign=brand", spendMinor: 2650_00, batch: "google-ads-sample.csv" },
    ],
    live: { status: 200, responseTimeMs: 580, html: page({ title: "Returns — Northstar Outfitters", h1: "Returns & repairs", trackers: [GA4] }) },
    fixed: { status: 200, responseTimeMs: 560, html: page({ title: "Returns — Northstar Outfitters", h1: "Returns & repairs", trackers: [GA4] }) },
  },
];

/**
 * Historical override for incident-history seeding: in the FIRST demo scan
 * (baseline), the trail-series page redirected in a loop. It was fixed
 * before the second scan, so that finding carries a resolvedAt in history.
 */
export const DEMO_HISTORY_OVERRIDES: Record<string, { scanIndex: number; spec: FixtureSpec }[]> = {
  "shop.northstar-outfitters.test/trail-series": [
    {
      scanIndex: 0,
      spec: {
        error: "REDIRECT_LOOP",
        redirects: [
          { to: "https://shop.northstar-outfitters.test/trail-series?utm_source=meta&utm_campaign=trail-series&from=loop1", statusCode: 301 },
          { to: "https://shop.northstar-outfitters.test/trail-series?utm_source=meta&utm_campaign=trail-series&from=loop2", statusCode: 302 },
          { to: "https://shop.northstar-outfitters.test/trail-series?utm_source=meta&utm_campaign=trail-series", statusCode: 301 },
        ],
      },
    },
  ],
};

/**
 * Build a synthetic PageFetchResult for a destination fixture.
 * `variant` selects the live or after-fixes state; `scanIndex` applies
 * historical overrides for incident-history seeding.
 */
export function fixtureFetch(
  destination: DemoDestination,
  variant: "live" | "fixed",
  scanIndex?: number
): PageFetchResult {
  let spec = variant === "live" ? destination.live : destination.fixed;

  if (scanIndex !== undefined && variant === "live") {
    const overrides = DEMO_HISTORY_OVERRIDES[destination.normalizedKey] ?? [];
    const match = overrides.find((o) => o.scanIndex === scanIndex);
    if (match) spec = match.spec;
  }

  // Deterministic small jitter so demo timings look measured, not cloned.
  const jitter = (destination.pathname.length * 37) % 90;

  if (spec.error) {
    const messages: Record<string, string> = {
      DNS_ERROR: "The scanner could not resolve this hostname (DNS).",
      TLS_ERROR: "The TLS connection failed: CERT_HAS_EXPIRED",
      CONNECTION_FAILURE: "The connection was refused.",
      TIMEOUT: "The scanner stopped this request after the timeout.",
      REDIRECT_LOOP: "The scanner stopped: this destination redirects in a loop.",
      TOO_MANY_REDIRECTS: "The scanner stopped after 5 redirects.",
      BLOCKED_URL: "The scanner blocked this destination for safety.",
    };
    return {
      kind: "error",
      requestedUrl: destination.rows[0]?.originalUrl ?? destination.representativeUrl,
      finalUrl: null,
      errorCode: spec.error,
      message: messages[spec.error] ?? "Synthetic failure",
      detail: "Synthetic demo fixture — no real request was made",
      responseTimeMs: 120 + jitter,
      redirects: (spec.redirects ?? []).map((r, i) => ({
        sequence: i,
        fromUrl: i === 0 ? destination.rows[0].originalUrl : spec.redirects![i - 1].to,
        toUrl: r.to,
        statusCode: r.statusCode,
        durationMs: 40 + ((i * 53 + jitter) % 120),
      })),
      httpStatus: null,
    };
  }

  const redirects: RedirectHopDraft[] = (spec.redirects ?? []).map((r, i) => ({
    sequence: i,
    fromUrl: i === 0 ? destination.rows[0].originalUrl : spec.redirects![i - 1].to,
    toUrl: r.to,
    statusCode: r.statusCode,
    durationMs: 60 + ((i * 61 + jitter) % 180),
  }));

  const finalUrl =
    redirects.length > 0 ? redirects[redirects.length - 1].toUrl : destination.rows[0].originalUrl;

  return {
    kind: "ok",
    requestedUrl: destination.rows[0].originalUrl,
    finalUrl,
    httpStatus: spec.status ?? 200,
    responseTimeMs: (spec.responseTimeMs ?? 800) + (variant === "live" ? jitter : jitter / 2),
    contentType: spec.contentType ?? "text/html; charset=utf-8",
    headers: { server: "synthetic-fixture" },
    html: spec.html ?? "",
    bytesInspected: (spec.html ?? "").length,
    truncatedAtCap: false,
    redirects,
  };
}

/** All demo campaign rows flattened. */
export function demoCampaignRows(): DemoCampaignRow[] {
  return DEMO_DESTINATIONS.flatMap((d) => d.rows);
}
