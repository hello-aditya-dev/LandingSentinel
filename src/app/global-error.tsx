"use client";

/**
 * Root error boundary — the last resort when the root layout itself fails.
 * Must render its own <html>/<body>. Deliberately minimal: no dependencies
 * on app components that may have caused the failure.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          backgroundColor: "#f4f0e7",
          color: "#181714",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <div style={{ fontSize: 13, letterSpacing: 2, color: "#57534c", fontFamily: "monospace" }}>
          APPLICATION / INTERRUPTED
        </div>
        <h1 style={{ margin: 0, fontSize: 24, maxWidth: 560, textAlign: "center", lineHeight: 1.3 }}>
          The application could not be displayed.
        </h1>
        <p style={{ margin: 0, maxWidth: 480, fontSize: 14, lineHeight: 1.6, color: "#57534c", textAlign: "center" }}>
          Saved scans, imports and reports live on the server and are unaffected. Retry, or
          return to the homepage.
        </p>
        {error.digest ? (
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#8a857b" }}>
            Reference: {error.digest}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 36,
              padding: "0 16px",
              fontSize: 13,
              background: "#181714",
              color: "#f4f0e7",
              border: "1px solid #181714",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              height: 36,
              display: "inline-flex",
              alignItems: "center",
              padding: "0 16px",
              fontSize: 13,
              background: "transparent",
              color: "#181714",
              border: "1px solid #bdb4a2",
              textDecoration: "none",
            }}
          >
            Return home
          </a>
        </div>
      </body>
    </html>
  );
}
