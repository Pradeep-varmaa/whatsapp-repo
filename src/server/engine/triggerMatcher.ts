import { executeQuery, sql } from "../database/connection";
import { FlowRunner } from "./runner";
import { logger } from "../security/logger";

export interface InboundReplyContext {
  senderPhone: string;
  receiverPhoneId: string;
  messageText: string;
  wamid: string;
  timestamp: string;
}

export class ReplyTriggerMatcher {
  private runner = new FlowRunner();

  /**
   * Matches an inbound customer reply against waiting runs or active trigger rules
   * Match precedence order:
   * 1. Resume active run waiting for a reply from this customer
   * 2. Exact keyword match
   * 3. Contains keyword match
   * 4. 24h recent interaction rule
   * 5. Fallback rule
   */
  async processInboundReply(ctx: InboundReplyContext): Promise<{ matched: boolean; actionTaken: string }> {
    const cleanPhone = ctx.senderPhone.replace(/\D/g, "");

    // 1. Check if any run is currently waiting for this customer's reply
    const waitingRuns = await executeQuery<any>(
      `SELECT TOP 1 run_id, project_id, variables_json
       FROM ENGINE_FLOW_RUNS
       WHERE waiting_for_reply = 1 AND (waiting_customer_phone = @phone OR waiting_customer_phone = @cleanPhone)
       ORDER BY updated_at DESC`,
      {
        phone: { type: sql.NVarChar(50), value: ctx.senderPhone },
        cleanPhone: { type: sql.NVarChar(50), value: cleanPhone },
      }
    );

    if (waitingRuns && waitingRuns.length > 0) {
      const run = waitingRuns[0];
      const vars = JSON.parse(run.variables_json || "{}");
      vars.lastCustomerReply = {
        text: ctx.messageText,
        wamid: ctx.wamid,
        senderPhone: ctx.senderPhone,
        timestamp: ctx.timestamp,
      };

      await executeQuery(
        `UPDATE ENGINE_FLOW_RUNS
         SET status = 'queued', waiting_for_reply = 0, variables_json = @vars, updated_at = SYSUTCDATETIME()
         WHERE run_id = @runId`,
        {
          runId: { type: sql.NVarChar(64), value: run.run_id },
          vars: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(vars) },
        }
      );

      // Trigger continuation asynchronously
      this.runner.executeRun(run.run_id).catch((err) => {
        logger.error(`Failed to resume waiting run ${run.run_id}:`, err);
      });

      return { matched: true, actionTaken: `Resumed waiting run ${run.run_id}` };
    }

    // 2. Fetch all active reply triggers ordered by priority ascending
    const triggers = await executeQuery<any>(
      `SELECT t.trigger_id, t.project_id, t.flow_id, t.trigger_type, t.keyword, t.priority,
              t.rate_limit_per_customer_per_hour, f.active_version
       FROM ENGINE_REPLY_TRIGGERS t
       INNER JOIN ENGINE_FLOWS f ON t.flow_id = f.flow_id
       WHERE t.is_active = 1 AND f.status = 'active'
       ORDER BY t.priority ASC`
    );

    if (!triggers || triggers.length === 0) {
      return { matched: false, actionTaken: "No active reply triggers configured" };
    }

    const text = ctx.messageText.trim().toLowerCase();
    let selectedTrigger: any = null;

    // Evaluate in strict priority order
    for (const trig of triggers) {
      const keyword = (trig.keyword || "").trim().toLowerCase();
      if (trig.trigger_type === "keyword_exact" && text === keyword) {
        selectedTrigger = trig;
        break;
      } else if (trig.trigger_type === "keyword_contains" && text.includes(keyword)) {
        selectedTrigger = trig;
        break;
      } else if (trig.trigger_type === "fallback" && !selectedTrigger) {
        selectedTrigger = trig;
      }
    }

    if (!selectedTrigger) {
      return { matched: false, actionTaken: "No trigger rules matched message content" };
    }

    // Loop prevention: check rate limit per customer per hour
    const recentTriggerRuns = await executeQuery<any>(
      `SELECT COUNT(*) AS run_count
       FROM ENGINE_FLOW_RUNS
       WHERE flow_id = @flowId AND waiting_customer_phone = @phone
         AND created_at >= DATEADD(hour, -1, SYSUTCDATETIME())`,
      {
        flowId: { type: sql.NVarChar(64), value: selectedTrigger.flow_id },
        phone: { type: sql.NVarChar(50), value: ctx.senderPhone },
      }
    );

    const runCount = recentTriggerRuns?.[0]?.run_count || 0;
    if (runCount >= selectedTrigger.rate_limit_per_customer_per_hour) {
      logger.warn(`Rate limit exceeded for customer ${ctx.senderPhone} on flow ${selectedTrigger.flow_id}`);
      return { matched: false, actionTaken: "Trigger rate limit exceeded for customer" };
    }

    // Get active version definition
    const versionRows = await executeQuery<any>(
      `SELECT version_id FROM ENGINE_FLOW_VERSIONS WHERE flow_id = @flowId AND version_number = @vNum`,
      {
        flowId: { type: sql.NVarChar(64), value: selectedTrigger.flow_id },
        vNum: { type: sql.Int, value: selectedTrigger.active_version },
      }
    );

    if (!versionRows || versionRows.length === 0) {
      return { matched: false, actionTaken: "Active flow version definition missing" };
    }

    const newRunId = `run_trig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const inputPayload = {
      sender: ctx.senderPhone,
      text: ctx.messageText,
      messageId: ctx.wamid,
      timestamp: ctx.timestamp,
    };

    await executeQuery(
      `INSERT INTO ENGINE_FLOW_RUNS (run_id, flow_id, version_id, project_id, triggered_by, status, input_json, variables_json, waiting_customer_phone, created_at, updated_at)
       VALUES (@runId, @flowId, @versionId, @projectId, 'trigger:reply', 'queued', @inputJson, '{}', @phone, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      {
        runId: { type: sql.NVarChar(64), value: newRunId },
        flowId: { type: sql.NVarChar(64), value: selectedTrigger.flow_id },
        versionId: { type: sql.NVarChar(64), value: versionRows[0].version_id },
        projectId: { type: sql.NVarChar(64), value: selectedTrigger.project_id },
        inputJson: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(inputPayload) },
        phone: { type: sql.NVarChar(50), value: ctx.senderPhone },
      }
    );

    this.runner.executeRun(newRunId).catch((err) => {
      logger.error(`Execution failed for triggered run ${newRunId}:`, err);
    });

    return { matched: true, actionTaken: `Started new flow run ${newRunId} (Trigger ID: ${selectedTrigger.trigger_id})` };
  }
}
