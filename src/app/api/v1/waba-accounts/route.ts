import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/security/guards";
import { WhatsAppAccountRepository } from "@/server/repositories/accountRepository";
import { ProjectRepository } from "@/server/repositories/projectRepository";
import { WhatsAppAccount } from "@/shared/types";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  const accountRepo = new WhatsAppAccountRepository();
  const accounts = await accountRepo.findByUser(user.userId);

  // Strict DTO Sanitization: Omit all sensitive tokens and internal secrets
  const sanitized = accounts.map((a) => ({
    wabaId: a.wabaId,
    accountName: a.accountName,
    currency: a.currency,
    timezoneId: a.timezoneId,
    accountReviewStatus: a.accountReviewStatus,
    businessVerificationStatus: a.businessVerificationStatus,
    healthStatus: a.healthStatus,
    phoneNumbersCount: a.phoneNumbersCount || 0,
    isDemoMode: a.isDemoMode,
    createdAt: a.createdAt,
  }));

  return NextResponse.json({
    success: true,
    data: sanitized,
    meta: {
      total: sanitized.length,
      correlationId,
      timestamp: new Date().toISOString(),
    },
  });
}

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
      { success: false, error: { code: "INVALID_JSON", message: "Invalid request payload." } },
      { status: 400 }
    );
  }

  const { wabaId, accountName, accessToken, appSecret, webhookVerifyToken, currency, timezoneId } = body;

  if (!wabaId || !accountName || !accessToken) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "wabaId, accountName, and accessToken are required.",
        },
      },
      { status: 400 }
    );
  }

  const accountRepo = new WhatsAppAccountRepository();
  const projectRepo = new ProjectRepository();

  const newAccount: WhatsAppAccount = {
    wabaId: wabaId.trim(),
    accountName: accountName.trim(),
    currency: currency || "USD",
    timezoneId: timezoneId || "UTC",
    accountReviewStatus: "APPROVED",
    businessVerificationStatus: "verified",
    healthStatus: "HEALTHY",
    isDemoMode: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 1. Create account record
  await accountRepo.create(newAccount);

  // 2. Vault credentials using AES-256-GCM encryption
  await accountRepo.storeCredentials(
    newAccount.wabaId,
    accessToken.trim(),
    appSecret ? appSecret.trim() : undefined,
    webhookVerifyToken ? webhookVerifyToken.trim() : undefined
  );

  // 3. Map user to this account
  await accountRepo.mapUserToAccount(user.userId, newAccount.wabaId, "user", false);

  // 4. Create default initial project under this WABA
  const initialProjectSlug = accountName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const defaultProject = await projectRepo.create({
    projectId: `proj_${crypto.randomUUID().slice(0, 8)}`,
    wabaId: newAccount.wabaId,
    name: `${accountName} Default Project`,
    slug: `${initialProjectSlug}-default-${Date.now().toString().slice(-4)}`,
    description: `Default communication channel for ${accountName}`,
    status: "active",
    callbackUrl: "https://yourdomain.com/webhooks/whatsapp/meta",
    eventTypes: ["message.received", "message.sent", "message.delivered"],
    webhookSigningSecret: `whsec_${crypto.randomBytes(16).toString("hex")}`,
  });

  // Strict sanitization: NEVER return the raw accessToken or appSecret
  return NextResponse.json({
    success: true,
    data: {
      account: {
        wabaId: newAccount.wabaId,
        accountName: newAccount.accountName,
        healthStatus: newAccount.healthStatus,
        phoneNumbersCount: 0,
      },
      defaultProject: {
        projectId: defaultProject.projectId,
        name: defaultProject.name,
        slug: defaultProject.slug,
      },
      tokenVaulted: true,
    },
    meta: { correlationId, timestamp: new Date().toISOString() },
  });
}
