import { ImageResponse } from "next/og";
import {
  loadOgFonts,
  loadMarkDataUri,
  PAPER,
  PAPER_RAISED,
  INK,
  INK_2,
  INK_3,
  HAIRLINE,
  CRITICAL,
} from "@/og/assets";

export const runtime = "nodejs";
export const alt =
  "LandingSentinel — paid-media landing-page preflight. Spend-weighted technical evidence for paid-media teams. Product preview with synthetic demo data.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MONEY_MAP_ROWS = [
  { url: "/summer-sale", spend: "£4,800", finding: "Meta Pixel not detected" },
  { url: "/products/shoes", spend: "£3,250", finding: "Campaign parameter removed" },
  { url: "/old-offer", spend: "£2,190", finding: "HTTP 404" },
];

export default async function Image() {
  const fonts = await loadOgFonts();
  const mark = await loadMarkDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: PAPER,
          padding: "44px 56px 40px 56px",
          fontFamily: "Inter",
        }}
      >
        {/* Identity row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          { }
          <img src={mark} width={42} height={42} alt="" />
          <div
            style={{
              fontFamily: "PlexMono",
              fontWeight: 500,
              fontSize: 21,
              letterSpacing: 3.5,
              color: INK_2,
            }}
          >
            LANDINGSENTINEL / PAID-MEDIA PREFLIGHT
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 24,
            fontFamily: "SourceSerif",
            fontWeight: 700,
            fontSize: 56,
            lineHeight: 1.12,
            color: INK,
          }}
        >
          <div>Catch campaign landing-page failures</div>
          <div>before the client does.</div>
        </div>

        {/* Secondary line */}
        <div
          style={{
            marginTop: 14,
            fontFamily: "Inter",
            fontWeight: 400,
            fontSize: 25,
            color: INK_2,
          }}
        >
          Spend-weighted technical evidence for paid-media teams.
        </div>

        {/* Product preview card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 22,
            backgroundColor: PAPER_RAISED,
            border: `1px solid ${HAIRLINE}`,
            padding: "18px 28px 14px 28px",
          }}
        >
          {/* Stat row + stamp */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 44 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontFamily: "SourceSerif",
                  fontWeight: 700,
                  fontSize: 40,
                  color: INK,
                  display: "flex",
                }}
              >
                £84,260
              </div>
              <div
                style={{
                  marginTop: 5,
                  fontFamily: "Inter",
                  fontWeight: 500,
                  fontSize: 14,
                  letterSpacing: 1.2,
                  color: INK_2,
                  display: "flex",
                }}
              >
                CAMPAIGN SPEND REPRESENTED
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontFamily: "SourceSerif",
                  fontWeight: 700,
                  fontSize: 40,
                  color: CRITICAL,
                  display: "flex",
                }}
              >
                £11,840
              </div>
              <div
                style={{
                  marginTop: 5,
                  fontFamily: "Inter",
                  fontWeight: 500,
                  fontSize: 14,
                  letterSpacing: 1.2,
                  color: INK_2,
                  display: "flex",
                }}
              >
                ASSOCIATED WITH CRITICAL DESTINATIONS
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                marginLeft: "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  border: `3px solid ${CRITICAL}`,
                  color: CRITICAL,
                  fontFamily: "PlexMono",
                  fontWeight: 500,
                  fontSize: 21,
                  letterSpacing: 2,
                  padding: "8px 14px",
                  transform: "rotate(-3deg)",
                }}
              >
                DO NOT LAUNCH
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontFamily: "PlexMono",
                  fontWeight: 400,
                  fontSize: 13,
                  letterSpacing: 1.5,
                  color: INK_3,
                  display: "flex",
                }}
              >
                SYNTHETIC DEMO DATA
              </div>
            </div>
          </div>

          {/* Money Map preview */}
          <div
            style={{
              display: "flex",
              marginTop: 16,
              paddingTop: 12,
              borderTop: `1px solid ${HAIRLINE}`,
              flexDirection: "column",
            }}
          >
            <div
              style={{
                fontFamily: "Inter",
                fontWeight: 500,
                fontSize: 12.5,
                letterSpacing: 2,
                color: INK_3,
                display: "flex",
              }}
            >
              MONEY MAP / TOP DESTINATIONS
            </div>

            {MONEY_MAP_ROWS.map((row) => (
              <div
                key={row.url}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 24,
                  paddingTop: 6,
                  paddingBottom: 6,
                  borderBottom: `1px solid ${HAIRLINE}`,
                }}
              >
                <div
                  style={{
                    fontFamily: "PlexMono",
                    fontWeight: 500,
                    fontSize: 17,
                    color: INK,
                    width: 300,
                    display: "flex",
                  }}
                >
                  {row.url}
                </div>
                <div
                  style={{
                    fontFamily: "PlexMono",
                    fontWeight: 500,
                    fontSize: 17,
                    color: INK,
                    width: 110,
                    display: "flex",
                  }}
                >
                  {row.spend}
                </div>
                <div
                  style={{
                    fontFamily: "Inter",
                    fontWeight: 400,
                    fontSize: 16,
                    color: INK_2,
                    display: "flex",
                  }}
                >
                  {row.finding}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontFamily: "Inter",
            fontWeight: 500,
            fontSize: 19,
            color: INK_2,
          }}
        >
          <div style={{ display: "flex" }}>White-label · Self-hosted · Source included</div>
          <div
            style={{
              fontFamily: "PlexMono",
              fontWeight: 400,
              fontSize: 14,
              letterSpacing: 1.5,
              color: INK_3,
              display: "flex",
            }}
          >
            SCAN · EVIDENCE · REPORT
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
