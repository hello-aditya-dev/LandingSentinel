/**
 * Shared asset loading for ImageResponse metadata routes
 * (opengraph-image, apple-icon, icon).
 *
 * Two-resolution strategy so the routes work in EVERY runtime:
 *   1. fetch(new URL(..., import.meta.url)) — the asset-traced pattern
 *      that Vercel's build output follows into serverless bundles.
 *   2. node:fs read from process.cwd() — correct for `next dev`,
 *      `next start` and self-hosted deployments.
 *
 * Fonts are the product's own typefaces (Source Serif 4 / Inter /
 * IBM Plex Mono) committed as TTFs so social previews never depend on
 * network access or system fonts.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const OG_ASSETS_DIR = "src/og";

const fontCache = new Map<string, ArrayBuffer>();

export async function loadOgFont(file: string): Promise<ArrayBuffer> {
  const cached = fontCache.get(file);
  if (cached) return cached;

  let data: ArrayBuffer | null = null;
  try {
    const res = await fetch(new URL(`./fonts/${file}`, import.meta.url));
    if (res.ok) data = await res.arrayBuffer();
  } catch {
    // file: URLs are not fetchable in plain Node — fall through to fs.
  }
  if (!data) {
    const buf = await readFile(join(process.cwd(), OG_ASSETS_DIR, "fonts", file));
    data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  fontCache.set(file, data);
  return data;
}

let markDataUri: string | null = null;

/**
 * The product mark (identical to src/app/icon.svg) as a data URI for
 * embedding inside ImageResponse compositions.
 */
export async function loadMarkDataUri(): Promise<string> {
  if (markDataUri) return markDataUri;

  let svg: string | null = null;
  try {
    const res = await fetch(new URL("../app/icon.svg", import.meta.url));
    if (res.ok) svg = await res.text();
  } catch {
    // fall through to fs.
  }
  if (!svg) {
    svg = await readFile(join(process.cwd(), "src", "app", "icon.svg"), "utf8");
  }
  markDataUri = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  return markDataUri;
}

export async function loadOgFonts(): Promise<
  { name: string; weight: 400 | 500 | 600 | 700; data: ArrayBuffer }[]
> {
  const [
    serif600,
    serif700,
    inter400,
    inter500,
    inter600,
    mono400,
    mono500,
  ] = await Promise.all([
    loadOgFont("Source_Serif_4_wght_600.ttf"),
    loadOgFont("Source_Serif_4_wght_700.ttf"),
    loadOgFont("Inter_wght_400.ttf"),
    loadOgFont("Inter_wght_500.ttf"),
    loadOgFont("Inter_wght_600.ttf"),
    loadOgFont("IBM_Plex_Mono_wght_400.ttf"),
    loadOgFont("IBM_Plex_Mono_wght_500.ttf"),
  ]);

  return [
    { name: "SourceSerif", weight: 600, data: serif600 },
    { name: "SourceSerif", weight: 700, data: serif700 },
    { name: "Inter", weight: 400, data: inter400 },
    { name: "Inter", weight: 500, data: inter500 },
    { name: "Inter", weight: 600, data: inter600 },
    { name: "PlexMono", weight: 400, data: mono400 },
    { name: "PlexMono", weight: 500, data: mono500 },
  ];
}

/* ------------------------------------------------------------------ */
/* Shared paper-system colour constants (mirrors globals.css tokens)  */
/* ------------------------------------------------------------------ */
export const PAPER = "#f4f0e7";
export const PAPER_RAISED = "#faf8f2";
export const PAPER_DEEP = "#ece7db";
export const INK = "#181714";
export const INK_2 = "#57534c";
export const INK_3 = "#8a857b";
export const HAIRLINE = "#d9d2c5";
export const HAIRLINE_STRONG = "#bdb4a2";
export const CRITICAL = "#a7372d";
