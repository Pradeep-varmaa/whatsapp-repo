export type Role = "superadmin" | "admin" | "subadmin" | "user";

export const PERMISSIONS = {
  // Meta Live Views & WhatsApp Connection
  WHATSAPP_CONNECTION_MANAGE: "whatsapp.connection.manage",
  WHATSAPP_LIVE_VIEW: "whatsapp.live.view",
  
  // Workflows & Runs
  FLOWS_VIEW: "flows.view",
  FLOWS_MANAGE: "flows.manage",
  FLOWS_RUN: "flows.run",

  // Security & Webhook Allowlist
  WEBHOOK_ALLOWLIST_MANAGE: "webhook.allowlist.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Single active unified role: all roles granted full administrative access
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  superadmin: Object.values(PERMISSIONS),
  admin: Object.values(PERMISSIONS),
  subadmin: Object.values(PERMISSIONS),
  user: Object.values(PERMISSIONS),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  // All access granted across the single operational role
  return true;
}
