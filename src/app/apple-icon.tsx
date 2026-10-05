import { ImageResponse } from "next/og";
import { loadMarkDataUri, PAPER, INK } from "@/og/assets";

export const runtime = "nodejs";
export const alt = "LandingSentinel — inspection-sheet product mark";
export const size = { width: 180, height: 180 };
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
        <img src={mark} width={132} height={132} alt="" />
      </div>
    ),
    { ...size },
  );
}
