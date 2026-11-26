import { NextRequest, NextResponse } from "next/server";
import { getMetaClientForWaba } from "@/server/integrations/meta/graphApiClient";
import { getServerConfig } from "@/server/config";
import { MessageRepository } from "@/server/repositories/messageRepository";
import { WebhookRepository } from "@/server/repositories/webhookRepository";
import { RequestLogRepository } from "@/server/repositories/requestLogRepository";
import { AuditLogRepository } from "@/server/repositories/auditLogRepository";
import { ProjectRepository } from "@/server/repositories/projectRepository";
import { PhoneNumberRepository } from "@/server/repositories/phoneNumberRepository";

export async function GET(req: NextRequest) {
  try {
    const config = getServerConfig();
    const url = new URL(req.url);
    const wabaId =
      req.headers.get("x-waba-id") ||
      req.cookies.get("active_waba_id")?.value ||
      url.searchParams.get("wabaId") ||
      config.WHATSAPP_WABA_ID;

    const projectId =
      req.headers.get("x-project-id") ||
      req.cookies.get("active_project_id")?.value ||
      url.searchParams.get("projectId") ||
      null;

    const client = await getMetaClientForWaba(wabaId);

    const messageRepo = new MessageRepository();
    const webhookRepo = new WebhookRepository();
    const requestLogRepo = new RequestLogRepository();
    const auditRepo = new AuditLogRepository();
    const projectRepo = new ProjectRepository();
    const phoneRepo = new PhoneNumberRepository();

    // 1. Fetch live numbers, subscribed apps, messages, deliveries, and project assignments
    const [metaPhoneResult, metaAppsResult, allMessages, allDeliveries, allRequests, failedRequests, projectList, assignments] =
      await Promise.all([
        wabaId
          ? client.getLivePhoneNumbers(wabaId).catch(() => ({ numbers: [], fetchedAt: new Date().toISOString() }))
          : Promise.resolve({ numbers: [], fetchedAt: new Date().toISOString() }),
        wabaId
          ? client.getLiveSubscribedApps(wabaId).catch(() => ({ apps: [], fetchedAt: new Date().toISOString() }))
          : Promise.resolve({ apps: [], fetchedAt: new Date().toISOString() }),
        messageRepo.findAll().catch(() => []),
        webhookRepo.findAllDeliveries().catch(() => []),
        requestLogRepo.findAll().catch(() => []),
        auditRepo.countFailures().catch(() => 0),
        wabaId ? projectRepo.findByWabaId(wabaId).catch(() => []) : Promise.resolve([]),
        phoneRepo.getProjectAssignments().catch(() => new Map()),
      ]);

    const liveNumbers = metaPhoneResult.numbers || [];
    const liveApps = metaAppsResult.apps || [];

    // Filter project-scoped data
    const projectPhoneIds = new Set(
      liveNumbers.filter((n: any) => !projectId || n.projectId === projectId).map((n: any) => n.id)
    );
    const messages = projectId ? allMessages.filter((m) => m.projectId === projectId) : allMessages;
    const deliveries = projectId ? allDeliveries.filter((d) => d.projectId === projectId) : allDeliveries;
    const requests = projectId
      ? allRequests.filter((r) => !r.phoneNumberId || projectPhoneIds.has(r.phoneNumberId))
      : allRequests;

    const serverRequests = requests.filter((r) => r.source === "server");
    const userRequests = requests.filter((r) => r.source === "user");

    const statusBreakdown = [
      { name: "Server Dispatches", value: serverRequests.length, color: "#2563EB" },
      { name: "Inbound Webhook Messages", value: userRequests.length, color: "#7C3AED" },
      { name: "Forwarded Webhook Deliveries", value: deliveries.length, color: "#16A34A" },
      { name: "Messages Received/Sent", value: messages.length, color: "#075E54" },
    ].filter((item) => item.value > 0);

    // Map projects with their explicitly assigned phone numbers for this WABA ID (filter out archived)
    const activeProjects = projectList.filter((p) => p.status !== "archived");
    const enrichedProjects = activeProjects.map((p) => {
      const assignedPhones = liveNumbers.filter((n: any) => {
        const assign = assignments.get(n.id);
        return assign?.projectId === p.projectId || n.projectId === p.projectId;
      });

      return {
        projectId: p.projectId,
        name: p.name,
        slug: p.slug,
        wabaId: p.wabaId || wabaId,
        status: p.status || "active",
        phoneNumbersCount: assignedPhones.length || p.phoneNumbersCount || 0,
        deliveryCount: deliveries.filter((d) => d.projectId === p.projectId).length,
        messageCount: messages.filter((m) => m.projectId === p.projectId).length,
        assignedNumbers: assignedPhones.map((ph: any) => ({
          phoneNumberId: ph.id,
          displayPhoneNumber: ph.display_phone_number || ph.displayPhoneNumber || ph.id,
          verifiedName: ph.verified_name || ph.verifiedName || "WhatsApp Sender",
          status: ph.status || "CONNECTED",
          qualityRating: ph.quality_rating || ph.qualityRating || "GREEN",
        })),
      };
    });

    const projectActivity = enrichedProjects.map((p) => ({
      name: p.name,
      slug: p.slug,
      phoneCount: p.phoneNumbersCount,
      deliveryCount: p.deliveryCount,
    }));

    return NextResponse.json({
      success: true,
      data: {
        kpis: {
          wabaId,
          projectId,
          activePhoneNumbers: liveNumbers.length,
          subscribedApps: liveApps.length,
          inboundWebhookMessages: userRequests.length,
          serverRequests: serverRequests.length,
          userRequests: userRequests.length,
          totalDeliveries: deliveries.length,
          totalMessages: messages.length,
          failedRequests,
        },
        deliveryBreakdown: statusBreakdown,
        projectActivity: projectActivity.length > 0 ? projectActivity : [
          { name: "Live Meta Phone Numbers", slug: "meta-numbers", phoneCount: liveNumbers.length, deliveryCount: liveNumbers.length },
          { name: "Inbound Replies Processed", slug: "user-replies", phoneCount: liveNumbers.length, deliveryCount: userRequests.length },
          { name: "Webhook Events Delivered", slug: "webhook-forwarding", phoneCount: liveNumbers.length, deliveryCount: deliveries.length },
        ],
        projects: enrichedProjects,
        recentRequests: requests.slice(0, 5),
        metaSource: {
          wabaId,
          projectId,
          fetchedAt: metaPhoneResult.fetchedAt,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { message: err.message || "Failed to fetch live overview metrics" } },
      { status: 500 }
    );
  }
}
