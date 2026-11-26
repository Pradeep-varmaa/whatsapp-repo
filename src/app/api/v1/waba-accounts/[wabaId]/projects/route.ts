import { NextRequest, NextResponse } from "next/server";
import { requireAccountAccess } from "@/server/security/guards";
import { ProjectRepository } from "@/server/repositories/projectRepository";
import crypto from "crypto";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ wabaId: string }> }
) {
  const correlationId = crypto.randomUUID();
  const { wabaId } = await context.params;

  const auth = await requireAccountAccess(req, wabaId);
  if (auth instanceof NextResponse) return auth;

  const projectRepo = new ProjectRepository();
  const projects = await projectRepo.findByWabaId(wabaId);

  const sanitized = projects.map((p) => ({
    projectId: p.projectId,
    wabaId: p.wabaId,
    name: p.name,
    slug: p.slug,
    description: p.description,
    status: p.status,
    phoneNumbersCount: p.phoneNumbersCount || 0,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  return NextResponse.json({
    success: true,
    data: sanitized,
    meta: {
      total: sanitized.length,
      wabaId,
      correlationId,
      timestamp: new Date().toISOString(),
    },
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ wabaId: string }> }
) {
  const correlationId = crypto.randomUUID();
  const { wabaId } = await context.params;

  const auth = await requireAccountAccess(req, wabaId);
  if (auth instanceof NextResponse) return auth;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_JSON", message: "Invalid payload." } },
      { status: 400 }
    );
  }

  const { name, description, callbackUrl } = body;
  if (!name) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Project name is required." } },
      { status: 400 }
    );
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const projectRepo = new ProjectRepository();

  const newProject = await projectRepo.create({
    projectId: `proj_${crypto.randomUUID().slice(0, 8)}`,
    wabaId,
    name: name.trim(),
    slug: `${slug}-${Date.now().toString().slice(-4)}`,
    description: description || null,
    status: "active",
    callbackUrl: callbackUrl || null,
    eventTypes: ["message.received", "message.sent", "message.delivered"],
    webhookSigningSecret: `whsec_${crypto.randomBytes(16).toString("hex")}`,
  });

  return NextResponse.json({
    success: true,
    data: newProject,
    meta: { correlationId, timestamp: new Date().toISOString() },
  });
}
