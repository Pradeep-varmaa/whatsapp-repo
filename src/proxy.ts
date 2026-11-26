import { NextRequest, NextResponse } from "next/server";

const STATIC_EXT_REGEX = /\.(?:ico|png|jpg|jpeg|gif|svg|webp|css|js|mjs|map|woff|woff2|ttf|eot)$/i;

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

async function verifySessionJwtEdge(token: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [b64Header, b64Payload, b64Sig] = parts;

    const payloadJson = decodeBase64Url(b64Payload);
    const payload = JSON.parse(payloadJson) as { exp?: number; userId?: string };
    if (!payload.userId || !payload.exp) return false;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return false;

    const secret =
      process.env.JWT_SECRET ||
      (process.env.STRICT_SECRETS === "true" && process.env.NODE_ENV === "production"
        ? ""
        : "wac_engine_jwt_signing_secret_super_long_32chars");

    if (!secret) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(`${b64Header}.${b64Payload}`));
    const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    if (expectedB64.length !== b64Sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expectedB64.length; i++) {
      diff |= expectedB64.charCodeAt(i) ^ b64Sig.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Static assets and internal next requests
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    STATIC_EXT_REGEX.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 2. Verify session JWT signature and expiration
  const sessionToken = req.cookies.get("session_token")?.value;
  const hasSession = sessionToken ? await verifySessionJwtEdge(sessionToken) : false;

  // If user visits /login while having valid session, redirect to /overview
  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/overview", req.url));
  }

  // If visiting dashboard pages without valid session, redirect to /login
  if (!pathname.startsWith("/api/")) {
    if (!hasSession && pathname !== "/login") {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!webhooks/whatsapp|api/webhook|api/v1|_next/static|_next/image|favicon.ico).*)",
  ],
};
