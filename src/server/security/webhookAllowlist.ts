import { executeQuery, sql } from "@/server/database/connection";
import net from "net";

const GLOBAL_SCOPE = "__global__";

// Project-scoped in-memory allowlist cache surviving hot reloads
const g = globalThis as unknown as { __scopedAllowedHosts?: Map<string, Set<string>> };
const scopedMemoryHosts = (g.__scopedAllowedHosts ??= new Map<string, Set<string>>([
  [
    GLOBAL_SCOPE,
    new Set<string>([
      "varmatec.in",
      "api.example.com",
      "httpbin.org",
      "jsonplaceholder.typicode.com",
    ]),
  ],
]));

function getScopeSet(projectId?: string | null): Set<string> {
  const key = projectId || GLOBAL_SCOPE;
  let set = scopedMemoryHosts.get(key);
  if (!set) {
    set = new Set<string>();
    scopedMemoryHosts.set(key, set);
  }
  return set;
}

/**
 * Block loopback, link-local, cloud metadata, and RFC1918 private IP ranges (SSRF protection).
 */
export function isPrivateOrReservedHost(hostname: string): boolean {
  const clean = hostname.toLowerCase().trim().replace(/^\[|\]$/g, "");
  if (!clean) return true;

  if (
    clean === "localhost" ||
    clean.endsWith(".localhost") ||
    clean.endsWith(".local") ||
    clean.endsWith(".internal") ||
    clean === "metadata.google.internal"
  ) {
    return true;
  }

  const ipVersion = net.isIP(clean);
  if (ipVersion === 4) {
    const parts = clean.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // Link-local / Cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast / reserved
  } else if (ipVersion === 6) {
    if (
      clean === "::" ||
      clean === "::1" ||
      clean.startsWith("fe80:") ||
      clean.startsWith("fc") ||
      clean.startsWith("fd") ||
      clean.startsWith("::ffff:127.") ||
      clean.startsWith("::ffff:10.") ||
      clean.startsWith("::ffff:169.254.") ||
      clean.startsWith("::ffff:192.168.")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Validate that an outbound URL uses http/https and does not target private/internal infrastructure.
 */
export function isSafeOutboundUrl(rawUrl: string): { safe: boolean; hostname?: string; reason?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { safe: false, reason: `Disallowed protocol: ${parsed.protocol}` };
    }
    const hostname = parsed.hostname.toLowerCase();
    if (isPrivateOrReservedHost(hostname)) {
      return { safe: false, hostname, reason: `Blocked private or reserved host: ${hostname}` };
    }
    return { safe: true, hostname };
  } catch {
    return { safe: false, reason: "Invalid URL format" };
  }
}

/**
 * Check if a hostname is allowed for server API calls and outbound webhooks (project-scoped)
 */
export async function isHostAllowed(hostname: string, projectId?: string | null): Promise<boolean> {
  const lowerHost = hostname.toLowerCase().trim();
  if (!lowerHost || isPrivateOrReservedHost(lowerHost)) return false;

  // 1. Check project-scoped and global in-memory sets
  if (scopedMemoryHosts.get(GLOBAL_SCOPE)?.has(lowerHost)) return true;
  if (projectId && scopedMemoryHosts.get(projectId)?.has(lowerHost)) return true;

  // 2. Database check: webhook_allowlist table (project-scoped or global NULL)
  try {
    const rows = await executeQuery<any>(
      `SELECT TOP 1 id, project_id FROM webhook_allowlist
       WHERE host = @host AND (project_id = @projectId OR project_id IS NULL)`,
      {
        host: { type: sql.NVarChar(255), value: lowerHost },
        projectId: { type: sql.NVarChar(64), value: projectId || null },
      }
    );
    if (rows && rows.length > 0) {
      getScopeSet(rows[0].project_id || null).add(lowerHost);
      return true;
    }
  } catch {}

  // 3. Database check: legacy ENGINE_WEBHOOK_ALLOWLIST table
  try {
    const legacyRows = await executeQuery<any>(
      `SELECT TOP 1 allowlist_id FROM ENGINE_WEBHOOK_ALLOWLIST
       WHERE hostname = @host AND is_active = 1`,
      { host: { type: sql.NVarChar(255), value: lowerHost } }
    );
    if (legacyRows && legacyRows.length > 0) {
      getScopeSet(GLOBAL_SCOPE).add(lowerHost);
      return true;
    }
  } catch {}

  return false;
}

/**
 * Add a host to the in-memory allowlist cache (scoped to projectId or global)
 */
export function addHostToMemory(hostname: string, projectId?: string | null): void {
  const clean = hostname.toLowerCase().trim();
  if (clean && !isPrivateOrReservedHost(clean)) {
    getScopeSet(projectId).add(clean);
  }
}

/**
 * Remove a host from in-memory allowlist cache
 */
export function removeHostFromMemory(hostname: string, projectId?: string | null): void {
  const clean = hostname.toLowerCase().trim();
  if (projectId) {
    scopedMemoryHosts.get(projectId)?.delete(clean);
  } else {
    for (const set of scopedMemoryHosts.values()) {
      set.delete(clean);
    }
  }
}

/**
 * List all hosts currently in the in-memory allowlist
 */
export function getMemoryHosts(projectId?: string | null): string[] {
  const combined = new Set<string>(scopedMemoryHosts.get(GLOBAL_SCOPE) || []);
  if (projectId) {
    for (const host of scopedMemoryHosts.get(projectId) || []) {
      combined.add(host);
    }
  }
  return Array.from(combined);
}
