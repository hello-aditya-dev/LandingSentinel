/**
 * Conservative HTML / content integrity inspection (cheerio, server-side).
 *
 * Checks: title, meta description, noindex, thin content, soft-404
 * heuristics, maintenance/unavailable patterns, sold-out patterns, CTA
 * presence, form presence. Language heuristics focus on English; this
 * limitation is stated in the UI and report method notes.
 */

import * as cheerio from "cheerio";

export type ContentInspection = {
  title: string | null;
  metaDescription: string | null;
  noindex: boolean;
  bodyTextLength: number;
  htmlLength: number;
  hasForm: boolean;
  hasCta: boolean;
  ctaPhrase: string | null;
  soft404: { match: boolean; evidence: string | null; signals: string[] };
  soldOut: { match: boolean; evidence: string | null; phrase: string | null };
  maintenance: { match: boolean; evidence: string | null; phrase: string | null };
};

const SOFT_404_PATTERNS = [
  "page not found",
  "404 error",
  "error 404",
  "product not found",
  "this page does not exist",
  "this page isn't available",
  "page cannot be found",
  "content unavailable",
  "no results found",
  "nothing was found",
];

const SOLD_OUT_PATTERNS = [
  "sold out",
  "out of stock",
  "currently unavailable",
  "no longer available",
  "not in stock",
  "unavailable in your size",
];

const MAINTENANCE_PATTERNS = [
  "down for maintenance",
  "maintenance mode",
  "temporarily unavailable",
  "currently undergoing maintenance",
  "be back soon",
  "we'll be right back",
  "site under maintenance",
];

const CTA_VOCABULARY = [
  "buy",
  "shop now",
  "shop",
  "add to cart",
  "add to basket",
  "get started",
  "book now",
  "book",
  "contact us",
  "contact",
  "enquire",
  "enquire now",
  "request a quote",
  "request",
  "start now",
  "start free",
  "subscribe",
  "download",
  "apply now",
  "apply",
  "order now",
  "checkout",
  "learn more",
  "sign up",
  "get a quote",
  "try",
];

function findPhrase(text: string, phrases: string[]): { phrase: string; index: number } | null {
  const lower = text.toLowerCase();
  for (const phrase of phrases) {
    const index = lower.indexOf(phrase);
    if (index !== -1) return { phrase, index };
  }
  return null;
}

function excerpt(text: string, index: number, radius = 70): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

export function inspectContent(html: string): ContentInspection {
  const $ = cheerio.load(html);
  const title = ($("title").first().text() ?? "").trim() || null;
  const metaDescription =
    ($('meta[name="description"]').attr("content") ?? "").trim() || null;
  const robots = ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
  const noindex =
    robots.includes("noindex") ||
    (($('meta[name="googlebot"]').attr("content") ?? "").toLowerCase().includes("noindex"));

  const scriptText = $("script").text();
  const bodyText = ($("body").text() ?? "").replace(/\s+/g, " ").trim();
  // Prominent text: title, h1/h2 and body text (scripts excluded where possible).
  const prominent = [
    title ?? "",
    $("h1").first().text() ?? "",
    $("h2").first().text() ?? "",
  ]
    .join(" · ")
    .trim();

  const htmlLength = html.length;

  // Forms: real <form> elements or well-known embedded form providers.
  const hasForm =
    $("form").length > 0 ||
    /hbspt\.forms|hsforms\.net|typeform\.com\/to\/|forms\.fillout\.com|tfa\.js|cognitoforms|jotform/i.test(html);

  // CTAs: buttons, submits and prominent links.
  let ctaPhrase: string | null = null;
  const ctaCandidates: string[] = [];
  $("button, input[type='submit'], a[class*='btn'], a[class*='button']").each((_, el) => {
    const text = $(el).text().trim();
    if (text) ctaCandidates.push(text);
  });
  if ($("a").length <= 60) {
    $("a").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 40) ctaCandidates.push(text);
    });
  }
  const ctaHaystack = ctaCandidates.join(" | ").toLowerCase();
  for (const vocab of CTA_VOCABULARY) {
    if (ctaHaystack.includes(vocab)) {
      ctaPhrase = vocab;
      break;
    }
  }
  const hasCta = ctaPhrase !== null;

  // Soft 404: needs a strong signal (title/h1) OR two distinct body signals.
  const softSignals: string[] = [];
  const titleMatch = findPhrase(prominent, SOFT_404_PATTERNS);
  if (titleMatch) softSignals.push(`Heading text: "${excerpt(prominent, titleMatch.index, 30)}"`);
  const bodyMatches = SOFT_404_PATTERNS.filter((p) => bodyText.toLowerCase().includes(p));
  for (const p of bodyMatches) {
    softSignals.push(`Body text contains "${p}"`);
  }
  const softMatch = titleMatch !== null || bodyMatches.length >= 2;
  const softEvidence =
    softMatch && titleMatch
      ? excerpt(prominent, titleMatch.index)
      : softMatch && bodyMatches.length > 0
        ? excerpt(bodyText, bodyText.toLowerCase().indexOf(bodyMatches[0]))
        : null;

  // Sold out / availability.
  const soldOutBody = findPhrase(bodyText, SOLD_OUT_PATTERNS);
  const soldOutProminent = findPhrase(prominent, SOLD_OUT_PATTERNS);
  const soldOutMatch = soldOutBody ?? soldOutProminent;
  const soldOut = {
    match: soldOutMatch !== null,
    evidence: soldOutMatch
      ? excerpt(soldOutBody ? bodyText : prominent, soldOutMatch.index)
      : null,
    phrase: soldOutMatch?.phrase ?? null,
  };

  // Maintenance / unavailable.
  const maintBody = findPhrase(bodyText, MAINTENANCE_PATTERNS);
  const maintProminent = findPhrase(prominent, MAINTENANCE_PATTERNS);
  const maintMatch = maintBody ?? maintProminent;
  const maintenance = {
    match: maintMatch !== null,
    evidence: maintMatch
      ? excerpt(maintBody ? bodyText : prominent, maintMatch.index)
      : null,
    phrase: maintMatch?.phrase ?? null,
  };

  return {
    title,
    metaDescription,
    noindex,
    bodyTextLength: bodyText.length,
    htmlLength,
    hasForm,
    hasCta,
    ctaPhrase,
    soft404: { match: softMatch, evidence: softEvidence, signals: softSignals.slice(0, 3) },
    soldOut,
    maintenance,
  };
}
