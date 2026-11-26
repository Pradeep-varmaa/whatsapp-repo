import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/security/guards";
import { WhatsAppAccountRepository } from "@/server/repositories/accountRepository";
import { ProjectRepository } from "@/server/repositories/projectRepository";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: "BAD_REQUEST", message: "Invalid JSON body." },
      },
      { status: 400 }
    );
  }

  const { wabaId, projectId } = body;
  if (!wabaId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "MISSING_WABA_ID", message: "wabaId is required to switch context." },
      },
      { status: 400 }
    );
  }

  const accountRepo = new WhatsAppAccountRepository();
  const hasAccess = await accountRepo.verifyUserAccess(user.userId, wabaId);
  if (!hasAccess && user.role !== "superadmin" && user.role !== "admin") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN_ACCOUNT", message: "User is not authorized for this WhatsApp Account." },
      },
      { status: 403 }
    );
  }

  const projectRepo = new ProjectRepository();
  const availableProjects = await projectRepo.findByWabaId(wabaId);

  let selectedProjectId = projectId;
  if (selectedProjectId) {
    const belongs = availableProjects.some((p) => p.projectId === selectedProjectId);
    if (!belongs) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PROJECT_NOT_IN_ACCOUNT",
            message: "The requested project does not belong to this WhatsApp Account.",
          },
        },
        { status: 404 }
      );
    }
  } else if (availableProjects.length > 0) {
    selectedProjectId = availableProjects[0].projectId;
  }

  const response = NextResponse.json({
    success: true,
    data: {
      activeWabaId: wabaId,
      activeProjectId: selectedProjectId || null,
      availableProjects: availableProjects.map((p) => ({
        projectId: p.projectId,
        name: p.name,
        slug: p.slug,
        phoneNumbersCount: p.phoneNumbersCount || 0,
      })),
    },
    meta: { correlationId, timestamp: new Date().toISOString() },
  });

  // Update cookies
  response.cookies.set({
    name: "active_waba_id",
    value: wabaId,
    httpOnly: false, // Accessible to client for instant switcher UI sync
    sameSite: "lax",
    path: "/",
    maxAge: 3600 * 24 * 7,
  });

  if (selectedProjectId) {
    response.cookies.set({
      name: "active_project_id",
      value: selectedProjectId,
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 3600 * 24 * 7,
    });
  }

  return response;
}
