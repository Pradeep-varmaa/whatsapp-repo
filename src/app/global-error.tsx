"use client";

import React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "40px", background: "#0a1622", color: "#f8fafc" }}>
        <h2>Something went wrong!</h2>
        <p style={{ color: "#94a3b8" }}>{error?.message || "An unexpected error occurred."}</p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: "16px",
            padding: "8px 16px",
            background: "#0f9d7a",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
