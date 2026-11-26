import { NextRequest, NextResponse } from "next/server";
import { signJwt } from "@/server/security/crypto";
import { UserRepository } from "@/server/repositories/userRepository";
import { WhatsAppAccountRepository } from "@/server/repositories/accountRepository";
import { ProjectRepository } from "@/server/repositories/projectRepository";
import { getServerConfig } from "@/server/config";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();

  let email = "admin@whatsapp.engine";
  let password = "";
  try {
    const body = await req.json();
    if (body?.email) email = body.email.trim();
    if (body?.password) password = body.password;
  } catch {
    // Ignore JSON parse errors for bypass/empty body
  }

  const userRepo = new UserRepository();
  let user = await userRepo.validateCredentials(email, password);

  if (!user) {
    // If user doesn't exist, register with 'user' role
    user = await userRepo.createOrUpdate({
      email,
      fullName: email.split("@")[0].toUpperCase() || "WhatsApp User",
      password: password || undefined,
      roleId: "user",
    });
  }

  // Fetch or associate WhatsApp accounts for this user
  const accountRepo = new WhatsAppAccountRepository();
  let userAccounts = await accountRepo.findByUser(user.userId);

  const config = getServerConfig();
  const configuredWabaId = config.WHATSAPP_WABA_ID || config.ACCOUNT_ID;

  if (userAccounts.length === 0 && configuredWabaId) {
    // Ensure configured WABA is registered in repository
    let defaultWaba = await accountRepo.findById(configuredWabaId);
    if (!defaultWaba) {
      defaultWaba = await accountRepo.create({
        wabaId: configuredWabaId,
        accountName: "Primary WhatsApp Account",
        currency: "USD",
        timezoneId: "UTC",
        accountReviewStatus: "APPROVED",
        businessVerificationStatus: "verified",
        healthStatus: "HEALTHY",
        isDemoMode: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Vault credentials if token exists in server config
    const configuredToken = config.WHATSAPP_ACCESS_TOKEN || config.ACCESS_TOKEN;
    if (configuredToken) {
      await accountRepo.storeCredentials(
        configuredWabaId,
        configuredToken,
        config.APP_SECRET,
        config.WEBHOOK_VERIFY_TOKEN
      );
    }

    // Map this user to this WABA
    await accountRepo.mapUserToAccount(user.userId, configuredWabaId, "user", true);
    userAccounts = await accountRepo.findByUser(user.userId);
  }

  const activeWaba = userAccounts.length > 0 ? userAccounts[0] : null;
  const activeWabaId = activeWaba ? activeWaba.wabaId : (configuredWabaId || "");

  // Find projects for the active WABA
  const projectRepo = new ProjectRepository();
  const projects = activeWabaId ? await projectRepo.findByWabaId(activeWabaId) : [];
  const activeProjectId = projects.length > 0 ? projects[0].projectId : "";

  const userRole = (user.roleId as any) || "user";

  // Sign JWT with scoped user session
  const token = signJwt(
    {
      userId: user.userId,
      email: user.email,
      role: userRole,
      projectIds: projects.map((p) => p.projectId),
      activeWabaId,
      activeProjectId,
    },
    3600 * 24 * 7 // 7 days session
  );

  const sanitizedAccounts = userAccounts.map((a) => ({
    wabaId: a.wabaId,
    accountName: a.accountName,
    healthStatus: a.healthStatus,
    phoneNumbersCount: a.phoneNumbersCount || 0,
    connectedProjectId: a.connectedProjectId,
  }));

  const sanitizedProjects = projects.map((p) => ({
    projectId: p.projectId,
    name: p.name,
    slug: p.slug,
    phoneNumbersCount: p.phoneNumbersCount || 0,
  }));

  const response = NextResponse.json({
    success: true,
    data: {
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      role: userRole,
      activeWabaId,
      activeProjectId,
      accounts: sanitizedAccounts,
      projects: sanitizedProjects,
    },
    meta: { correlationId, timestamp: new Date().toISOString() },
  });

  // Set session cookie
  response.cookies.set({
    name: "session_token",
    value: token,
    httpOnly: true,
    secure: false, // Ensures cookie attaches on http://localhost:3000
    sameSite: "lax",
    path: "/",
    maxAge: 3600 * 24 * 7,
  });

  if (activeWabaId) {
    response.cookies.set({
      name: "active_waba_id",
      value: activeWabaId,
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 3600 * 24 * 7,
    });
  }

  if (activeProjectId) {
    response.cookies.set({
      name: "active_project_id",
      value: activeProjectId,
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 3600 * 24 * 7,
    });
  }

  return response;
}
