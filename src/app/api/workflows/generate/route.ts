import { NextRequest, NextResponse } from "next/server";
import { executeQuery, sql } from "@/server/database/connection";
import { requireAuth } from "@/server/security/guards";
import { generateWorkflowFromTemplate, generateWorkflowFromPrompt } from "@/server/workflows/generate";
import { z } from "zod";
import crypto from "crypto";

const generateSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("template"),
    projectId: z.string().min(1, "Project ID is required"),
    phoneNumberId: z.string().optional().nullable(),
    name: z.string().optional(),
    templateId: z.string().min(1, "Template ID is required"),
    parameters: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    mode: z.literal("prompt"),
    projectId: z.string().min(1, "Project ID is required"),
    phoneNumberId: z.string().optional().nullable(),
    name: z.string().optional(),
    prompt: z.string().min(3, "Prompt must be at least 3 characters"),
  }),
]);

/**
 * POST /api/workflows/generate
 * Generates a draft workflow from either (a) a template with parameters, or (b) a Groq LLM prompt.
 * Strictly enforces graph validation and saves ONLY as draft.
 */
export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Server-side RBAC: 'user' cannot generate workflows (admin or superadmin only)
  if (auth.user.role === "user") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Only administrators can generate workflows." },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues.map((i) => i.message).join(", "),
          },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    const { mode, projectId, phoneNumberId, name } = parsed.data;

    let generationResult;
    if (mode === "template") {
      generationResult = generateWorkflowFromTemplate({
        templateId: parsed.data.templateId,
        name,
        parameters: parsed.data.parameters,
      });
    } else {
      generationResult = await generateWorkflowFromPrompt({
        prompt: parsed.data.prompt,
        name,
      });
    }

    // Graph validation enforcement: If validation failed even after retry, NEVER save!
    if (!generationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "GRAPH_VALIDATION_FAILED",
            message: "Generated workflow failed structural graph validation after retries.",
            validationErrors: generationResult.errors || [],
          },
          meta: {
            attempts: generationResult.attempts,
            correlationId,
            timestamp: new Date().toISOString(),
          },
        },
        { status: 422 }
      );
    }

    const workflowId = `wf_gen_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const finalName = generationResult.name;
    const finalTriggerType = generationResult.triggerType;
    const finalTriggerValue = generationResult.triggerValue;
    const finalGraph = generationResult.graph;

    // Save strictly as draft (never published)
    await executeQuery(
      `INSERT INTO workflows (id, project_id, phone_number_id, name, trigger_type, trigger_value, priority, status, version, graph_json, created_by, created_at, updated_at)
       VALUES (@id, @projectId, @phoneId, @name, @triggerType, @triggerValue, 0, 'draft', 1, @graphJson, @createdBy, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      {
        id: { type: sql.NVarChar(64), value: workflowId },
        projectId: { type: sql.NVarChar(64), value: projectId },
        phoneId: { type: sql.NVarChar(64), value: phoneNumberId || null },
        name: { type: sql.NVarChar(150), value: finalName },
        triggerType: { type: sql.NVarChar(30), value: finalTriggerType },
        triggerValue: { type: sql.NVarChar(255), value: finalTriggerValue || null },
        graphJson: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(finalGraph) },
        createdBy: { type: sql.NVarChar(64), value: auth.user.userId },
      }
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          id: workflowId,
          projectId,
          name: finalName,
          triggerType: finalTriggerType,
          triggerValue: finalTriggerValue,
          status: "draft",
          version: 1,
          graph: finalGraph,
        },
        meta: {
          mode,
          attempts: generationResult.attempts,
          correlationId,
          timestamp: new Date().toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "GENERATION_FAILED", message: err.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
