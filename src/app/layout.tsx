import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhatsApp Communication Engine",
  description: "Enterprise Centralized WhatsApp API & Routing Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {/* 3 fixed, blurred, pointer-events-none color blobs behind content */}
        <div className="blob-container" aria-hidden="true">
          <div className="blob blob-teal" />
          <div className="blob blob-violet" />
          <div className="blob blob-sky" />
        </div>
        <div style={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>
          {children}
        </div>
      </body>
    </html>
  );
}

