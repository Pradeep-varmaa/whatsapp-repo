import { z } from "zod";
import { Role } from "../security/permissions";
import { getMetaGraphApiClient } from "../integrations/meta/graphApiClient";
import { executeQuery, sql } from "../database/connection";
import crypto from "crypto";

export interface ActionExecutionContext {
  runId: string;
  projectId: string;
  stepId: string;
  variables: Record<string, any>;
  input: Record<string, any>;
  idempotencyKey: string;
}

export interface ActionExecutionResult {
  success: boolean;
  output?: Record<string, any>;
  errorCode?: string;
  errorMessage?: string;
  shouldWait?: boolean;
  waitingFor?: string;
}

export interface ActionTypeDefinition<TConfig = any> {
  name: string;
  label: string;
  description: string;
  minimumRole: Role;
  schema: z.ZodSchema<TConfig>;
  execute: (config: TConfig, ctx: ActionExecutionContext) => Promise<ActionExecutionResult>;
}

// ---------------------------------------------------------------------------
// 1. whatsapp.send_text
// ---------------------------------------------------------------------------
const sendTextSchema = z.object({
  phoneNumberId: z.string().min(1, "Phone Number ID is required"),
  recipientPhone: z.string().min(1, "Recipient Phone is required"),
  text: z.string().min(1, "Text body is required"),
});

const sendTextAction: ActionTypeDefinition<z.infer<typeof sendTextSchema>> = {
  name: "whatsapp.send_text",
  label: "Send WhatsApp Text",
  description: "Sends a direct text message to a WhatsApp customer via Meta Graph API.",
  minimumRole: "user",
  schema: sendTextSchema,
  execute: async (cfg, ctx) => {
    const client = getMetaGraphApiClient();
    try {
      const res = await client.sendTextMessage({
        phoneNumberId: cfg.phoneNumberId,
        recipientPhone: cfg.recipientPhone,
        text: cfg.text,
      });
      return { success: true, output: { wamid: res.wamid } };
    } catch (err: any) {
      return { success: false, errorCode: err.code || "SEND_FAILED", errorMessage: err.message };
    }
  },
};

// ---------------------------------------------------------------------------
// 2. whatsapp.send_template
// ---------------------------------------------------------------------------
const sendTemplateSchema = z.object({
  phoneNumberId: z.string().min(1, "Phone Number ID is required"),
  recipientPhone: z.string().min(1, "Recipient Phone is required"),
  templateName: z.string().min(1, "Template name is required"),
  languageCode: z.string().default("en_US"),
  components: z.array(z.any()).optional(),
});

const sendTemplateAction: ActionTypeDefinition<z.infer<typeof sendTemplateSchema>> = {
  name: "whatsapp.send_template",
  label: "Send WhatsApp Template",
  description: "Sends a pre-approved Meta WhatsApp Template message.",
  minimumRole: "user",
  schema: sendTemplateSchema,
  execute: async (cfg, ctx) => {
    const client = getMetaGraphApiClient();
    try {
      const res = await client.sendTemplateMessage({
        phoneNumberId: cfg.phoneNumberId,
        recipientPhone: cfg.recipientPhone,
        templateName: cfg.templateName,
        languageCode: cfg.languageCode,
        components: cfg.components,
      });
      return { success: true, output: { wamid: res.wamid } };
    } catch (err: any) {
      return { success: false, errorCode: err.code || "SEND_FAILED", errorMessage: err.message };
    }
  },
};

// ---------------------------------------------------------------------------
// 3. flow.set_variable
// ---------------------------------------------------------------------------
const setVariableSchema = z.object({
  variableName: z.string().min(1),
  value: z.any(),
});

const setVariableAction: ActionTypeDefinition<z.infer<typeof setVariableSchema>> = {
  name: "flow.set_variable",
  label: "Set Variable",
  description: "Sets or computes a runtime variable accessible to downstream steps.",
  minimumRole: "user",
  schema: setVariableSchema,
  execute: async (cfg) => {
    return { success: true, output: { [cfg.variableName]: cfg.value } };
  },
};

// ---------------------------------------------------------------------------
// 4. flow.wait
// ---------------------------------------------------------------------------
const waitSchema = z.object({
  waitFor: z.enum(["customer_reply", "duration"]),
  durationSeconds: z.number().positive().optional(),
});

const waitAction: ActionTypeDefinition<z.infer<typeof waitSchema>> = {
  name: "flow.wait",
  label: "Wait Event",
  description: "Pauses flow execution until a customer reply arrives or duration expires.",
  minimumRole: "user",
  schema: waitSchema,
  execute: async (cfg, ctx) => {
    if (cfg.waitFor === "customer_reply") {
      return {
        success: true,
        shouldWait: true,
        waitingFor: "customer_reply",
        output: { waitingStartedAt: new Date().toISOString() },
      };
    }
    return { success: true, output: { waitedSeconds: cfg.durationSeconds } };
  },
};

// ---------------------------------------------------------------------------
// 5. flow.condition
// ---------------------------------------------------------------------------
const conditionSchema = z.object({
  leftOperand: z.string(),
  operator: z.enum(["equals", "not_equals", "contains", "greater_than"]),
  rightOperand: z.string(),
});

const conditionAction: ActionTypeDefinition<z.infer<typeof conditionSchema>> = {
  name: "flow.condition",
  label: "Condition Branch",
  description: "Evaluates an expression to determine flow branching.",
  minimumRole: "user",
  schema: conditionSchema,
  execute: async (cfg) => {
    let result = false;
    const l = String(cfg.leftOperand);
    const r = String(cfg.rightOperand);
    if (cfg.operator === "equals") result = l === r;
    else if (cfg.operator === "not_equals") result = l !== r;
    else if (cfg.operator === "contains") result = l.toLowerCase().includes(r.toLowerCase());
    else if (cfg.operator === "greater_than") result = Number(l) > Number(r);

    return { success: true, output: { conditionPassed: result } };
  },
};

// ---------------------------------------------------------------------------
// 6. http.webhook (Outbound Webhook with SSRF Protection & Allowlist)
// ---------------------------------------------------------------------------
const webhookSchema = z.object({
  url: z.string().url(),
  method: z.enum(["POST", "PUT"]).default("POST"),
  payload: z.record(z.string(), z.any()),
});

const webhookAction: ActionTypeDefinition<z.infer<typeof webhookSchema>> = {
  name: "http.webhook",
  label: "Outbound Webhook",
  description: "Dispatches HTTPS data to an approved destination with HMAC signature.",
  minimumRole: "admin",
  schema: webhookSchema,
  execute: async (cfg, ctx) => {
    const parsedUrl = new URL(cfg.url);

    // 1. Enforce HTTPS only
    if (parsedUrl.protocol !== "https:") {
      return { success: false, errorCode: "INSECURE_PROTOCOL", errorMessage: "Webhooks must use HTTPS protocol." };
    }

    // 2. Block private and local networks (SSRF defense)
    const host = parsedUrl.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") || // AWS metadata IP block
      host === "::1"
    ) {
      return { success: false, errorCode: "SSRF_PROHIBITED", errorMessage: "Dispatch to internal network or localhost is forbidden." };
    }

    // 3. Check Superadmin Hostname Allowlist
    try {
      const allowed = await executeQuery<any>(
        `SELECT allowlist_id FROM ENGINE_WEBHOOK_ALLOWLIST WHERE hostname = @host AND is_active = 1`,
        { host: { type: sql.NVarChar(255), value: host } }
      );
      if (!allowed || allowed.length === 0) {
        return {
          success: false,
          errorCode: "DESTINATION_NOT_ALLOWLISTED",
          errorMessage: `Hostname '${host}' is not on the superadmin approved webhook allowlist.`,
        };
      }
    } catch {
      // Allowlist query failed
    }

    // 4. Sign payload with HMAC-SHA256
    const serializedPayload = JSON.stringify(cfg.payload);
    const signature = crypto.createHmac("sha256", "whsec_outbound_engine_signature").update(serializedPayload).digest("hex");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // Strict short timeout

    try {
      const res = await fetch(cfg.url, {
        method: cfg.method,
        headers: {
          "Content-Type": "application/json",
          "X-Engine-Signature-256": `sha256=${signature}`,
          "X-Engine-Run-Id": ctx.runId,
          "X-Engine-Step-Id": ctx.stepId,
        },
        body: serializedPayload,
        redirect: "error", // No redirects allowed
        signal: controller.signal,
      });

      const responseText = (await res.text()).slice(0, 4000); // Truncate response
      return {
        success: res.ok,
        output: { statusCode: res.status, body: responseText },
        errorCode: !res.ok ? `HTTP_${res.status}` : undefined,
        errorMessage: !res.ok ? `Webhook responded with status ${res.status}` : undefined,
      };
    } catch (err: any) {
      return { success: false, errorCode: "WEBHOOK_FAILED", errorMessage: err.message };
    } finally {
      clearTimeout(timeout);
    }
  },
};

// ---------------------------------------------------------------------------
// Registry Map
// ---------------------------------------------------------------------------
const actionRegistry = new Map<string, ActionTypeDefinition<any>>([
  [sendTextAction.name, sendTextAction],
  [sendTemplateAction.name, sendTemplateAction],
  [setVariableAction.name, setVariableAction],
  [waitAction.name, waitAction],
  [conditionAction.name, conditionAction],
  [webhookAction.name, webhookAction],
]);

export function getActionType(name: string): ActionTypeDefinition<any> | undefined {
  return actionRegistry.get(name);
}

export function listActionTypes(): ActionTypeDefinition<any>[] {
  return Array.from(actionRegistry.values());
}
