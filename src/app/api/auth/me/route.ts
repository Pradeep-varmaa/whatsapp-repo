import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/security/guards";
import { WhatsAppAccountRepository } from "@/server/repositories/accountRepository";
import { ProjectRepository } from "@/server/repositories/projectRepository";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const user = await authenticateRequest(req);

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHENTICATED", message: "No active session." },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 401 }
    );
  }

  const accountRepo = new WhatsAppAccountRepository();
  const projectRepo = new ProjectRepository();

  const userAccounts = await accountRepo.findByUser(user.userId);
  const activeWabaId = user.activeWabaId || (userAccounts.length > 0 ? userAccounts[0].wabaId : "");

  let projects: any[] = [];
  if (activeWabaId) {
    const rawProjects = await projectRepo.findByWabaId(activeWabaId);
    projects = rawProjects.map((p) => ({
      projectId: p.projectId,
      name: p.name,
      slug: p.slug,
      status: p.status,
      phoneNumbersCount: p.phoneNumbersCount || 0,
    }));
  }

  const activeProjectId =
    user.activeProjectId && projects.some((p) => p.projectId === user.activeProjectId)
      ? user.activeProjectId
      : projects.length > 0
      ? projects[0].projectId
      : "";

  // Sanitize accounts (Zero Key Exposure: omit all tokens and secrets)
  const sanitizedAccounts = userAccounts.map((a) => ({
    wabaId: a.wabaId,
    accountName: a.accountName,
    healthStatus: a.healthStatus,
    phoneNumbersCount: a.phoneNumbersCount || 0,
    isDemoMode: a.isDemoMode,
  }));

  return NextResponse.json({
    success: true,
    data: {
      userId: user.userId,
      email: user.email,
      fullName: user.email.split("@")[0].toUpperCase(),
      role: user.role,
      activeWabaId,
      activeProjectId,
      accounts: sanitizedAccounts,
      projects,
    },
    meta: { correlationId, timestamp: new Date().toISOString() },
  });
}
