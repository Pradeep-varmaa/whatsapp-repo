import { NextRequest, NextResponse } from "next/server";
import { getMetaGraphApiClient } from "@/server/integrations/meta/graphApiClient";
import { getServerConfig } from "@/server/config";
import { authenticateRequest } from "@/server/security/guards";
import { TemplateRepository } from "@/server/repositories/templateRepository";
import { auditService } from "@/server/services/auditService";
import { MessageTemplate } from "@/shared/types";
import { z } from "zod";
import crypto from "crypto";

const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1, "Template name is required")
    .regex(/^[a-z0-9_]+$/, "Template name must contain only lowercase letters, numbers, and underscores (e.g. order_shipped_v1)"),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]),
  language: z.string().default("en_US"),
  components: z.array(z.any()).min(1, "At least one component is required"),
});

export async function GET(_req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const repo = new TemplateRepository();

  try {
    const config = getServerConfig();
    const wabaId = config.WHATSAPP_WABA_ID || "315448454992777";
    const client = getMetaGraphApiClient();

    let metaTemplates: any[] = [];
    let fetchedAt = new Date().toISOString();

    try {
      const res = await client.getLiveTemplates(wabaId);
      metaTemplates = res.templates || [];
      fetchedAt = res.fetchedAt;
    } catch {
      // Offline / sandbox fallback
    }

    // Merge live Meta templates with in-memory templates
    const repoTemplates = await repo.findAll(wabaId);
    const combinedMap = new Map<string, any>();

    // Add repo templates first
    for (const t of repoTemplates) {
      combinedMap.set(t.name.toLowerCase(), {
        id: t.templateId,
        name: t.name,
        status: t.status,
        category: t.category,
        language: t.language,
        components: t.components || [
          ...(t.headerType && t.headerType !== "NONE" ? [{ type: "HEADER", format: t.headerType, text: t.headerContent }] : []),
          { type: "BODY", text: t.bodyText },
          ...(t.footerText ? [{ type: "FOOTER", text: t.footerText }] : []),
          ...(t.buttons ? [{ type: "BUTTONS", buttons: t.buttons }] : []),
        ],
        updatedAt: t.updatedAt,
      });
    }

    // Overlay Meta templates
    for (const mt of metaTemplates) {
      combinedMap.set(mt.name.toLowerCase(), {
        id: mt.id,
        name: mt.name,
        status: mt.status || "APPROVED",
        category: mt.category || "UTILITY",
        language: mt.language || "en_US",
        components: mt.components || [],
      });
    }

    const templates = Array.from(combinedMap.values());

    return NextResponse.json({
      success: true,
      data: {
        wabaId,
        templates,
        count: templates.length,
      },
      meta: {
        fetchedAt,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    const repoTemplates = await repo.findAll();
    return NextResponse.json({
      success: true,
      data: {
        wabaId: "315448454992777",
        templates: repoTemplates,
        count: repoTemplates.length,
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        correlationId,
      },
    });
  }
}

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const requestId = `req_${Date.now()}_tpl`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
  const userAgent = req.headers.get("user-agent") || "";

  const authUser = await authenticateRequest(req);
  if (!authUser) {
    return NextResponse.json({ success: false, error: { message: "Authentication required" } }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_FAILED",
            message: parsed.error.issues[0]?.message || "Invalid template payload",
          },
        },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const config = getServerConfig();
    const wabaId = config.WHATSAPP_WABA_ID || "315448454992777";
    const client = getMetaGraphApiClient();
    const repo = new TemplateRepository();

    let metaId = `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let metaStatus: "APPROVED" | "PENDING" = "PENDING";

    // Attempt live creation on Meta
    try {
      const res = await client.createLiveTemplate(wabaId, {
        name: input.name,
        category: input.category,
        language: input.language,
        components: input.components,
      });
      if (res?.id) {
        metaId = res.id;
        metaStatus = (res.status as any) || "PENDING";
      }
    } catch (metaErr: any) {
      console.warn(`[Templates] Live Meta submission note: ${metaErr.message}. Storing template locally.`);
      // If Meta rejects because offline or format, in sandbox we still register it in repo
    }

    // Extract header, body, footer, buttons for repository mapping
    const headerComp = input.components.find((c: any) => c.type === "HEADER");
    const bodyComp = input.components.find((c: any) => c.type === "BODY");
    const footerComp = input.components.find((c: any) => c.type === "FOOTER");
    const buttonsComp = input.components.find((c: any) => c.type === "BUTTONS");

    const newTemplate: MessageTemplate = {
      templateId: metaId,
      wabaId,
      name: input.name,
      language: input.language,
      category: input.category,
      status: metaStatus,
      headerType: headerComp?.format || (headerComp ? "TEXT" : "NONE"),
      headerContent: headerComp?.text || null,
      bodyText: bodyComp?.text || "",
      footerText: footerComp?.text || null,
      buttons: buttonsComp?.buttons || [],
      components: input.components,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await repo.create(newTemplate);

    await auditService.record({
      request_id: requestId,
      event: "template_created",
      outcome: "success",
      reason: "template_created",
      ip,
      user_agent: userAgent,
      endpoint: "/api/v1/meta/templates",
      http_status: 201,
      error_summary: `Created template: ${input.name} (${input.category})`,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: metaId,
          status: metaStatus,
          name: input.name,
          category: input.category,
          language: input.language,
          components: input.components,
        },
        meta: { correlationId, requestId },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { message: err.message || "Failed to create template" } },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") || searchParams.get("id");

  if (!name) {
    return NextResponse.json({ success: false, error: { message: "Template name is required" } }, { status: 400 });
  }

  const authUser = await authenticateRequest(req);
  if (!authUser || (authUser.role !== "admin" && authUser.role !== "superadmin")) {
    return NextResponse.json({ success: false, error: { message: "Admin role required to delete templates" } }, { status: 403 });
  }

  const config = getServerConfig();
  const wabaId = config.WHATSAPP_WABA_ID || "315448454992777";
  const client = getMetaGraphApiClient();
  const repo = new TemplateRepository();

  try {
    await client.deleteLiveTemplate(wabaId, name);
  } catch {
    // Offline / fallback
  }

  await repo.delete(name);

  return NextResponse.json({ success: true, data: { deleted: name } });
}
