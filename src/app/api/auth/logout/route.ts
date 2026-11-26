import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/security/guards";
import { auditService } from "@/server/services/auditService";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const user = await authenticateRequest(req);

  if (user) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "";
    await auditService.record({
      request_id: correlationId,
      event: "auth_logout",
      outcome: "success",
      reason: "user_logout",
      ip,
      user_agent: userAgent,
      endpoint: "/api/auth/logout",
      http_status: 200,
      error_summary: `User ${user.userId} logged out`,
    });
  }

  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully",
    meta: { correlationId, timestamp: new Date().toISOString() },
  });

  // Clear cookie
  response.cookies.set({
    name: "session_token",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
