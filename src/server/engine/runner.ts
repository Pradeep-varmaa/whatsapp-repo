import { executeQuery, sql } from "../database/connection";
import { getActionType, ActionExecutionContext } from "./registry";
import { logger } from "../security/logger";
import crypto from "crypto";

export interface FlowStepDefinition {
  stepId: string;
  actionType: string;
  config: Record<string, any>;
  retries?: number;
  onError?: "stop" | "skip" | "retry";
}

/**
 * Safe runtime placeholder substitution without prototype pollution risk
 */
export function resolvePlaceholders(template: any, scope: { input: Record<string, any>; vars: Record<string, any> }): any {
  if (typeof template === "string") {
    return template.replace(/\{\{([\w.]+)\}\}/g, (_, path: string) => {
      const parts = path.split(".");
      const rootKey = parts[0];
      if (rootKey === "__proto__" || rootKey === "constructor" || rootKey === "prototype") {
        return "";
      }
      let current: any = rootKey === "input" ? scope.input : rootKey === "vars" ? scope.vars : undefined;
      for (let i = 1; i < parts.length; i++) {
        if (current === undefined || current === null) return "";
        const sub = parts[i];
        if (sub === "__proto__" || sub === "constructor" || sub === "prototype") return "";
        current = current[sub];
      }
      return current !== undefined && current !== null ? String(current) : "";
    });
  }

  if (Array.isArray(template)) {
    return template.map((item) => resolvePlaceholders(item, scope));
  }

  if (template !== null && typeof template === "object") {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(template)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      result[key] = resolvePlaceholders(val, scope);
    }
    return result;
  }

  return template;
}

export class FlowRunner {
  private static MAX_STEPS_GUARD = 200;

  /**
   * Execute steps of an active run with loop guard, idempotency keys, and step persistence
   */
  async executeRun(runId: string): Promise<void> {
    const runRows = await executeQuery<any>(
      `SELECT r.run_id, r.flow_id, r.project_id, r.status, r.input_json, r.variables_json,
              r.current_step_index, r.step_execution_count, v.definition_json
       FROM ENGINE_FLOW_RUNS r
       INNER JOIN ENGINE_FLOW_VERSIONS v ON r.version_id = v.version_id
       WHERE r.run_id = @runId AND r.status IN ('queued', 'running')`,
      { runId: { type: sql.NVarChar(64), value: runId } }
    );

    if (!runRows || runRows.length === 0) return;
    const run = runRows[0];

    // Atomically claim the run
    await executeQuery(
      `UPDATE ENGINE_FLOW_RUNS SET status = 'running', claimed_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE run_id = @runId`,
      { runId: { type: sql.NVarChar(64), value: runId } }
    );

    let steps: FlowStepDefinition[] = [];
    try {
      const def = JSON.parse(run.definition_json);
      steps = def.steps || [];
    } catch {
      await this.failRun(runId, "INVALID_FLOW_DEFINITION", "Failed to parse flow definition JSON.");
      return;
    }

    let currentIndex = run.current_step_index || 0;
    let stepCount = run.step_execution_count || 0;
    const input = JSON.parse(run.input_json || "{}");
    const variables = JSON.parse(run.variables_json || "{}");

    while (currentIndex < steps.length) {
      // Loop guard check
      if (stepCount >= FlowRunner.MAX_STEPS_GUARD) {
        await this.failRun(runId, "LOOP_GUARD_EXCEEDED", `Flow exceeded maximum step threshold (${FlowRunner.MAX_STEPS_GUARD}).`);
        return;
      }

      // Check for mid-execution user cancellation
      const cancelCheck = await executeQuery<any>(
        `SELECT status FROM ENGINE_FLOW_RUNS WHERE run_id = @runId`,
        { runId: { type: sql.NVarChar(64), value: runId } }
      );
      if (cancelCheck?.[0]?.status === "cancelled") {
        logger.info(`Run ${runId} was cancelled by user.`);
        return;
      }

      const step = steps[currentIndex];
      const actionDef = getActionType(step.actionType);
      if (!actionDef) {
        await this.failRun(runId, "UNKNOWN_ACTION_TYPE", `Action type '${step.actionType}' is not registered.`);
        return;
      }

      // Resolve step config values against inputs and accumulated variables
      const resolvedConfig = resolvePlaceholders(step.config, { input, vars: variables });
      const idempotencyKey = crypto.createHash("sha256").update(`${runId}:${step.stepId}:${stepCount}`).digest("hex");

      const startTime = Date.now();
      const ctx: ActionExecutionContext = {
        runId,
        projectId: run.project_id,
        stepId: step.stepId,
        variables,
        input,
        idempotencyKey,
      };

      const result = await actionDef.execute(resolvedConfig, ctx);
      const durationMs = Date.now() - startTime;

      // Persist step execution log
      await executeQuery(
        `INSERT INTO ENGINE_RUN_STEPS (step_run_id, run_id, step_id, action_type, status, input_snapshot_json, output_result_json, idempotency_key, error_code, error_message, duration_ms, executed_at)
         VALUES (@stepRunId, @runId, @stepId, @actionType, @status, @inputJson, @outputJson, @idem, @errCode, @errMsg, @dur, SYSUTCDATETIME())`,
        {
          stepRunId: { type: sql.NVarChar(64), value: `step_run_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` },
          runId: { type: sql.NVarChar(64), value: runId },
          stepId: { type: sql.NVarChar(64), value: step.stepId },
          actionType: { type: sql.NVarChar(50), value: step.actionType },
          status: { type: sql.NVarChar(30), value: result.success ? "completed" : "failed" },
          inputJson: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(resolvedConfig) },
          outputJson: { type: sql.NVarChar(sql.MAX), value: result.output ? JSON.stringify(result.output) : null },
          idem: { type: sql.NVarChar(128), value: idempotencyKey },
          errCode: { type: sql.NVarChar(50), value: result.errorCode || null },
          errMsg: { type: sql.NVarChar(sql.MAX), value: result.errorMessage || null },
          dur: { type: sql.Int, value: durationMs },
        }
      );

      if (!result.success) {
        if (step.onError === "skip") {
          currentIndex++;
          stepCount++;
          continue;
        } else {
          await this.failRun(runId, result.errorCode || "STEP_FAILED", result.errorMessage || "Step execution failed.");
          return;
        }
      }

      // Step succeeded: Merge output into run variables
      if (result.output) {
        variables[step.stepId] = result.output;
      }

      if (result.shouldWait && result.waitingFor === "customer_reply") {
        await executeQuery(
          `UPDATE ENGINE_FLOW_RUNS
           SET status = 'waiting', waiting_for_reply = 1, current_step_index = @idx,
               step_execution_count = @cnt, variables_json = @vars, updated_at = SYSUTCDATETIME()
           WHERE run_id = @runId`,
          {
            runId: { type: sql.NVarChar(64), value: runId },
            idx: { type: sql.Int, value: currentIndex + 1 },
            cnt: { type: sql.Int, value: stepCount + 1 },
            vars: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(variables) },
          }
        );
        return;
      }

      currentIndex++;
      stepCount++;

      // Update checkpoint after each step
      await executeQuery(
        `UPDATE ENGINE_FLOW_RUNS
         SET current_step_index = @idx, step_execution_count = @cnt, variables_json = @vars, updated_at = SYSUTCDATETIME()
         WHERE run_id = @runId`,
        {
          runId: { type: sql.NVarChar(64), value: runId },
          idx: { type: sql.Int, value: currentIndex },
          cnt: { type: sql.Int, value: stepCount },
          vars: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(variables) },
        }
      );
    }

    // All steps completed
    await executeQuery(
      `UPDATE ENGINE_FLOW_RUNS
       SET status = 'completed', completed_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
       WHERE run_id = @runId`,
      { runId: { type: sql.NVarChar(64), value: runId } }
    );
  }

  private async failRun(runId: string, errorCode: string, errorMessage: string): Promise<void> {
    await executeQuery(
      `UPDATE ENGINE_FLOW_RUNS
       SET status = 'failed', last_error_code = @code, last_error_message = @msg,
           completed_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
       WHERE run_id = @runId`,
      {
        runId: { type: sql.NVarChar(64), value: runId },
        code: { type: sql.NVarChar(50), value: errorCode },
        msg: { type: sql.NVarChar(sql.MAX), value: errorMessage },
      }
    );
  }
}
