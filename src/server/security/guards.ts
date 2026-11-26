import { NextRequest, NextResponse } from "next/server";
import { verifyJwt, verifyApiKeyHash } from "./crypto";
import { Permission, hasPermission, Role } from "./permissions";
import { executeQuery, sql } from "../database/connection";
import crypto from "crypto";
import { getServerConfig } from "../config";
import { WhatsAppAccountRepository } from "../repositories/accountRepository";
import { ProjectRepository } from "../repositories/projectRepository";
import { ApiKeyRepository } from "../repositories/apiKeyRepository";
import { Project } from "@/shared/types";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
  projectIds: string[];
  scopes?: string[];
  activeWabaId?: string;
  activeProjectId?: string;
}

/**
 * Validate either session cookie (JWT) or Authorization Header (Bearer API key or Bearer JWT)
 */
export async function authenticateRequest(req: NextRequest): Promise<AuthenticatedUser | null> {
  const cookieWabaId = req.cookies.get("active_waba_id")?.value;
  const cookieProjectId = req.cookies.get("active_project_id")?.value;
  const headerWabaId = req.headers.get("x-waba-id");
  const headerProjectId = req.headers.get("x-project-id");

  // 1. Check HTTP-only Session Cookie
  const sessionCookie = req.cookies.get("session_token")?.value;
  if (sessionCookie) {
    const payload = verifyJwt(sessionCookie);
    if (payload) {
      return {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        projectIds: payload.projectIds || [],
        activeWabaId: headerWabaId || cookieWabaId || payload.activeWabaId,
        activeProjectId: headerProjectId || cookieProjectId || payload.activeProjectId,
      };
    }
  }

  // 2. Check Authorization Header
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();

  // 2a. Is it a JWT?
  if (token.includes(".")) {
    const payload = verifyJwt(token);
    if (payload) {
      return {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        projectIds: payload.projectIds || [],
        activeWabaId: headerWabaId || cookieWabaId || payload.activeWabaId,
        activeProjectId: headerProjectId || cookieProjectId || payload.activeProjectId,
      };
    }
  }

  // 2b. Is it an API Key? (e.g. wae_live_... in api_keys, or legacy ENGINE_API_KEYS)
  try {
    const apiKeyRepo = new ApiKeyRepository();
    const keyPrefix = token.slice(0, 16);
    const candidates = await apiKeyRepo.findByPrefix(keyPrefix);
    for (const candidate of candidates) {
      if (candidate.revoked_at) continue;
      if (candidate.expires_at && new Date(candidate.expires_at).getTime() < Date.now()) continue;
      if (verifyApiKeyHash(token, candidate.key_hash)) {
        const hasAdminScope = candidate.scopes?.includes("admin") || candidate.scopes?.includes("*");
        return {
          userId: `key_${candidate.id}`,
          email: `apikey@project.${candidate.project_id || "global"}`,
          role: hasAdminScope ? "admin" : "user",
          projectIds: candidate.project_id ? [candidate.project_id] : [],
          scopes: candidate.scopes || ["messages:send"],
          activeWabaId: headerWabaId || cookieWabaId,
          activeProjectId: candidate.project_id || headerProjectId || cookieProjectId,
        };
      }
    }
  } catch {
    // Fall through to legacy ENGINE_API_KEYS check
  }

  const config = getServerConfig();
  const keyHash = crypto
    .createHmac("sha256", config.API_KEY_HASH_SECRET)
    .update(token)
    .digest("hex");

  try {
    const rows = await executeQuery<any>(
      `SELECT k.key_id, k.project_id, k.status, k.expires_at, p.name AS project_name, p.waba_id
       FROM ENGINE_API_KEYS k
       INNER JOIN ENGINE_PROJECTS p ON k.project_id = p.project_id
       WHERE k.key_hash = @hash AND k.status = 'active'`,
      { hash: { type: sql.NVarChar(255), value: keyHash } }
    );

    if (rows && rows.length > 0) {
      const apiKey = rows[0];
      if (apiKey.expires_at && new Date(apiKey.expires_at).getTime() < Date.now()) {
        return null;
      }
      return {
        userId: `key_${apiKey.key_id}`,
        email: `apikey@project.${apiKey.project_id}`,
        role: "user",
        projectIds: [apiKey.project_id],
        scopes: ["messages:send"],
        activeWabaId: apiKey.waba_id || headerWabaId || cookieWabaId,
        activeProjectId: apiKey.project_id,
      };
    }
  } catch {
    // Database check failed
  }

  return null;
}

/**
 * Guard that requires an authenticated user with a specific permission
 */
export async function requireAuth(
  req: NextRequest,
  requiredPermission?: Permission
): Promise<{ user: AuthenticatedUser } | NextResponse> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  const user = await authenticateRequest(req);

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required. Provide a valid session or Bearer token." },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 401 }
    );
  }

  if (requiredPermission && !hasPermission(user.role, requiredPermission)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: `Insufficient permissions. Role '${user.role}' lacks permission '${requiredPermission}'.`,
        },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 403 }
    );
  }

  return { user };
}

/**
 * Guard that requires an authenticated user with verified access to the requested WhatsApp Account (WABA).
 */
export async function requireAccountAccess(
  req: NextRequest,
  targetWabaId?: string
): Promise<{ user: AuthenticatedUser; wabaId: string } | NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const user = auth.user;
  const config = getServerConfig();
  const requestedWabaId =
    targetWabaId ||
    req.headers.get("x-waba-id") ||
    req.nextUrl.searchParams.get("wabaId") ||
    user.activeWabaId ||
    config.WHATSAPP_WABA_ID;

  if (!requestedWabaId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "WABA_REQUIRED", message: "No WhatsApp Account specified in request context." },
      },
      { status: 400 }
    );
  }

  const accountRepo = new WhatsAppAccountRepository();
  const hasAccess = await accountRepo.verifyUserAccess(user.userId, requestedWabaId);

  if (!hasAccess && user.role !== "superadmin" && user.role !== "admin") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN_ACCOUNT_ACCESS", message: "Access denied to requested WhatsApp account." },
      },
      { status: 403 }
    );
  }

  return { user, wabaId: requestedWabaId };
}

/**
 * Guard that requires an authenticated user with verified access to the requested Project
 * belonging to the selected WhatsApp Account.
 */
export async function requireProjectAccess(
  req: NextRequest,
  targetProjectId?: string
): Promise<{ user: AuthenticatedUser; wabaId: string; projectId: string; project: Project } | NextResponse> {
  const accountAuth = await requireAccountAccess(req);
  if (accountAuth instanceof NextResponse) return accountAuth;

  const { user, wabaId } = accountAuth;
  const projectRepo = new ProjectRepository();

  const requestedProjectId =
    targetProjectId ||
    req.headers.get("x-project-id") ||
    req.nextUrl.searchParams.get("projectId") ||
    user.activeProjectId;

  const projectsInWaba = await projectRepo.findByWabaId(wabaId);

  if (projectsInWaba.length === 0) {
    // Return empty project context safely if WABA has no projects created yet
    return NextResponse.json(
      {
        success: false,
        error: { code: "NO_PROJECTS_FOUND", message: "No projects found under this WhatsApp Account." },
        data: [],
      },
      { status: 404 }
    );
  }

  let matchedProject: Project | null = null;
  if (requestedProjectId) {
    matchedProject = projectsInWaba.find((p) => p.projectId === requestedProjectId) || null;
  } else {
    // Default to the first project in this WABA
    matchedProject = projectsInWaba[0];
  }

  if (!matchedProject) {
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

  return {
    user,
    wabaId,
    projectId: matchedProject.projectId,
    project: matchedProject,
  };
}

/**
 * Verify Project Ownership for Admin/User roles (Administrators bypass project scoping)
 */
export function assertProjectAccess(user: AuthenticatedUser, projectId?: string | null): boolean {
  if (user.role === "superadmin" || user.role === "admin") return true;
  if (!projectId) return false;
  return (user.projectIds && user.projectIds.includes(projectId)) || user.activeProjectId === projectId;
}
