import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/security/guards";
import { executeQuery, sql } from "@/server/database/connection";
import { isHostAllowed } from "@/server/security/webhookAllowlist";
import { interpolateString } from "@/server/workflows/variableInterpolator";
import { z } from "zod";
import crypto from "crypto";

const testApiSchema = z.object({
  projectId: z.string().optional().default("default"),
  url: z.string().min(1, "URL is required"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  authorization: z.string().optional().nullable(),
  contentType: z.string().optional().nullable().default("application/json"),
  headers: z.record(z.string(), z.string()).optional().nullable(),
  body: z.string().optional().nullable(),
  sampleVariables: z.record(z.string(), z.any()).optional(),
});

function extractJsonPaths(
  obj: any,
  prefix = "",
  maxDepth = 4,
  currentDepth = 0
): Array<{ path: string; sample: string; type: string }> {
  if (currentDepth > maxDepth || !obj || typeof obj !== "object") return [];
  const list: Array<{ path: string; sample: string; type: string }> = [];

  for (const [key, val] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const isArr = Array.isArray(val);
    const isObj = typeof val === "object" && val !== null && !isArr;
    const valType = isArr ? "array" : typeof val;

    let sampleStr = "";
    if (val === null) sampleStr = "null";
    else if (val === undefined) sampleStr = "undefined";
    else if (isObj || isArr) {
      sampleStr = JSON.stringify(val);
      if (sampleStr.length > 60) sampleStr = sampleStr.slice(0, 57) + "...";
    } else {
      sampleStr = String(val);
    }

    list.push({
      path: fullPath,
      sample: sampleStr,
      type: valType,
    });

    if (isObj && Object.keys(val).length <= 25) {
      list.push(...extractJsonPaths(val, fullPath, maxDepth, currentDepth + 1));
    }
  }

  return list;
}

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const rawBody = await req.json();
    const parsed = testApiSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_FAILED",
            message: parsed.error.issues[0]?.message || "Invalid input payload",
          },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    const { projectId, url, method, authorization, contentType, headers, body, sampleVariables } =
      parsed.data;

    // Build context dictionary with sample variables or defaults
    const testContext: Record<string, any> = {
      order_id: "ORD12345",
      customer_phone: "+919876543210",
      phone: "+919876543210",
      sender_phone: "+919876543210",
      mobile: "+919876543210",
      clean_phone: "919876543210",
      customer_email: "user@example.com",
      customer_name: "Valued Customer",
      ...(sampleVariables || {}),
    };

    // Interpolate URL and Body
    const resolvedUrl = interpolateString(url, testContext);
    let targetUrl: URL;
    try {
      targetUrl = new URL(resolvedUrl);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_URL", message: `Invalid URL format: ${resolvedUrl}` },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    // Host Allowlist check
    const lowerHost = targetUrl.hostname.toLowerCase().trim();
    const isAllowed = await isHostAllowed(lowerHost, projectId);

    if (!isAllowed) {
      return NextResponse.json(
        {
          success: false,
          isAllowlistError: true,
          hostname: lowerHost,
          error: {
            code: "HOST_NOT_ALLOWLISTED",
            message: `Host "${lowerHost}" is not in the Webhook Allowlist. Please add it to your project's Webhook Allowlist to enable live calls.`,
          },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 403 }
      );
    }

    // Assemble Request Headers
    const reqHeaders: Record<string, string> = {
      "Content-Type": contentType || "application/json",
      "User-Agent": "WAEngine-WorkflowRunner/1.0",
      Accept: "application/json, text/plain, */*",
    };

    if (authorization) {
      reqHeaders["Authorization"] = interpolateString(authorization, testContext);
    }

    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        reqHeaders[k] = interpolateString(String(v), testContext);
      }
    }

    let reqBody: string | undefined = undefined;
    if (["POST", "PUT", "PATCH"].includes(method) && body) {
      reqBody = interpolateString(body, testContext);
    }

    // Execute Live HTTP Request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const startTime = Date.now();

    let fetchRes: Response;
    try {
      fetchRes = await fetch(targetUrl.toString(), {
        method,
        headers: reqHeaders,
        body: reqBody,
        signal: controller.signal,
      });
    } catch (networkErr: any) {
      clearTimeout(timeoutId);
      const isTimeout = networkErr.name === "AbortError";
      return NextResponse.json(
        {
          success: false,
          error: {
            code: isTimeout ? "REQUEST_TIMEOUT" : "NETWORK_ERROR",
            message: isTimeout
              ? "Request timed out after 8 seconds."
              : networkErr.message || "Network connection failed.",
          },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 502 }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const durationMs = Date.now() - startTime;
    const responseText = await fetchRes.text();
    const cappedText = responseText.slice(0, 100 * 1024);

    let parsedJson: any = null;
    let isJson = false;
    try {
      parsedJson = JSON.parse(cappedText);
      isJson = true;
    } catch {
      parsedJson = null;
    }

    const extractedFields = isJson ? extractJsonPaths(parsedJson) : [];

    return NextResponse.json({
      success: true,
      data: {
        status: fetchRes.status,
        statusText: fetchRes.statusText,
        ok: fetchRes.ok,
        durationMs,
        isJson,
        json: parsedJson,
        rawText: cappedText,
        fields: extractedFields,
      },
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "SERVER_ERROR", message: err.message || "Failed to test API" },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
