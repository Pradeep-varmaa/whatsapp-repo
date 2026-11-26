import { NextRequest, NextResponse } from "next/server";
import { getMetaClientForWaba } from "@/server/integrations/meta/graphApiClient";
import { getServerConfig } from "@/server/config";
import { requireAccountAccess } from "@/server/security/guards";
import { auditService } from "@/server/services/auditService";
import { ProjectRepository } from "@/server/repositories/projectRepository";
import crypto from "crypto";

// Local app details registry for custom metadata & user-defined channels
interface CustomAppDetails {
  id: string;
  name: string;
  link?: string;
  subscribedFields?: string[];
}
const localCustomApps = new Map<string, CustomAppDetails>();

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();

  const auth = await requireAccountAccess(req);
  if (auth instanceof NextResponse) return auth;

  const { user, wabaId } = auth;

  try {
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get("refresh") === "true";
    const client = await getMetaClientForWaba(wabaId);
    const projectRepo = new ProjectRepository();

    const [metaResult, dbProjects] = await Promise.all([
      client.getLiveSubscribedApps(wabaId, { bypassCache: refresh }).catch(() => ({
        apps: [],
        fetchedAt: new Date().toISOString(),
      })),
      projectRepo.findByWabaId(wabaId).catch(() => []),
    ]);

    let apps = metaResult.apps || [];

    // Overlay custom user-defined metadata (e.g. custom appName, webhookUrl)
    apps = apps.map((app) => {
      const custom = localCustomApps.get(app.id);
      return {
        ...app,
        name: custom?.name || app.name,
        link: custom?.link || app.link,
      };
    });

    // Merge database projects if any exist that haven't been subscribed directly via Meta
    for (const proj of dbProjects) {
      if (!apps.some((a) => a.id === proj.projectId || a.name === proj.name)) {
        apps.push({
          id: proj.projectId,
          name: proj.name,
          link: proj.callbackUrl || `https://developers.facebook.com/apps/${proj.projectId}`,
        });
      }
    }

    const activeAppId =
      req.headers.get("x-project-id") ||
      req.cookies.get("active_project_id")?.value ||
      user.activeProjectId ||
      (apps.length > 0 ? apps[0].id : "");

    const enrichedApps = apps.map((a) => ({
      ...a,
      isActive: a.id === activeAppId,
    }));

    return NextResponse.json({
      success: true,
      data: {
        wabaId,
        activeAppId,
        apps: enrichedApps,
        count: enrichedApps.length,
      },
      meta: {
        fetchedAt: metaResult.fetchedAt,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: error.code || "SUBSCRIBED_APPS_FETCH_FAILED", message: error.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: error.status || 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();

  const auth = await requireAccountAccess(req);
  if (auth instanceof NextResponse) return auth;

  const { wabaId } = auth;

  try {
    const client = await getMetaClientForWaba(wabaId);
    const projectRepo = new ProjectRepository();

    let appId: string | undefined;
    let appName: string | undefined;
    let webhookUrl: string | undefined;
    let subscribedFields: string[] | undefined;

    try {
      const body = await req.json();
      if (body?.appId && typeof body.appId === "string") {
        appId = body.appId.trim();
      }
      if (body?.appName && typeof body.appName === "string") {
        appName = body.appName.trim();
      }
      if (body?.webhookUrl && typeof body.webhookUrl === "string") {
        webhookUrl = body.webhookUrl.trim();
      }
      if (Array.isArray(body?.subscribedFields)) {
        subscribedFields = body.subscribedFields;
      }
    } catch {
      // Body is optional
    }

    const targetAppId = appId || `app_${crypto.randomUUID().slice(0, 8)}`;
    const finalAppName = appName || `WhatsApp App (${targetAppId.slice(0, 8)})`;

    localCustomApps.set(targetAppId, {
      id: targetAppId,
      name: finalAppName,
      link: webhookUrl || `https://developers.facebook.com/apps/${targetAppId}`,
      subscribedFields,
    });

    let result = { success: true, data: null };
    try {
      result = await client.subscribeAppToWaba(wabaId, targetAppId);
    } catch (e: any) {
      console.warn("[SubscribedApps] Live Meta subscribe notice:", e.message);
    }

    // Also register as managed project in MSSQL / repository
    const slug = finalAppName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await projectRepo.create({
      projectId: targetAppId,
      wabaId,
      name: finalAppName,
      slug: `${slug}-${Date.now().toString().slice(-4)}`,
      description: `Meta WhatsApp Application: ${finalAppName}`,
      status: "active",
      callbackUrl: webhookUrl || null,
      eventTypes: ["message.received", "message.sent", "message.delivered"],
      webhookSigningSecret: `whsec_${crypto.randomBytes(16).toString("hex")}`,
    });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "";
    await auditService.record({
      request_id: correlationId,
      event: "app_subscribed",
      outcome: "success",
      reason: "subscribed_to_waba",
      ip,
      user_agent: userAgent,
      endpoint: "/api/subscribed-apps",
      http_status: 200,
      error_summary: `Subscribed app ${targetAppId} to WABA ${wabaId}`,
    });

    let { apps, fetchedAt } = await client.getLiveSubscribedApps(wabaId);

    // Overlay custom user-defined metadata
    apps = apps.map((app) => {
      const custom = localCustomApps.get(app.id);
      return {
        ...app,
        name: custom?.name || app.name,
        link: custom?.link || app.link,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        wabaId,
        apps,
        subscriptionResult: result,
      },
      meta: {
        fetchedAt,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: error.code || "SUBSCRIBE_FAILED", message: error.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: error.status || 502 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const correlationId = crypto.randomUUID();

  const auth = await requireAccountAccess(req);
  if (auth instanceof NextResponse) return auth;

  const { wabaId } = auth;

  try {
    const client = await getMetaClientForWaba(wabaId);

    const { searchParams } = new URL(req.url);
    let appId = searchParams.get("appId") || undefined;

    if (!appId) {
      try {
        const body = await req.json();
        if (body?.appId && typeof body.appId === "string") {
          appId = body.appId.trim();
        }
      } catch {
        // Body optional
      }
    }

    if (appId) {
      localCustomApps.delete(appId);
    }

    let result = { success: true, data: null };
    try {
      result = await client.unsubscribeAppFromWaba(wabaId, appId);
    } catch (e: any) {
      console.warn("[SubscribedApps] Live Meta unsubscribe notice:", e.message);
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "";
    await auditService.record({
      request_id: correlationId,
      event: "app_unsubscribed",
      outcome: "success",
      reason: "unsubscribed_from_waba",
      ip,
      user_agent: userAgent,
      endpoint: "/api/subscribed-apps",
      http_status: 200,
      error_summary: `Unsubscribed app ${appId} from WABA ${wabaId}`,
    });

    let { apps, fetchedAt } = await client.getLiveSubscribedApps(wabaId);

    // Overlay custom user-defined metadata
    apps = apps.map((app) => {
      const custom = localCustomApps.get(app.id);
      return {
        ...app,
        name: custom?.name || app.name,
        link: custom?.link || app.link,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        wabaId,
        apps,
        deletedAppId: appId,
        unsubscriptionResult: result,
      },
      meta: {
        fetchedAt,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: error.code || "UNSUBSCRIBE_FAILED", message: error.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: error.status || 502 }
    );
  }
}
