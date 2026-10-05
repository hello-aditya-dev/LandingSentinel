import { ImageResponse } from "next/og";
import { loadMarkDataUri, PAPER } from "@/og/assets";

/**
 * High-resolution application icon (512×512). The same mark also ships as
 * icon.svg (the crisp vector favicon every modern browser prefers); this
 * PNG covers surfaces that want a raster icon — PWA manifests, social
 * link-unfurl fallbacks, OS-level shortcuts.
 */
export const runtime = "nodejs";
export const alt = "LandingSentinel — inspection-sheet product mark";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Image() {
  const mark = await loadMarkDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: PAPER,
        }}
      >
        { }
        <img src={mark} width={376} height={376} alt="" />
      </div>
    ),
    { ...size },
  );
}
