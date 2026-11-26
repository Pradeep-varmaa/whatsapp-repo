import { executeQuery, sql } from "@/server/database/connection";
import { FlowRunner } from "./flowRunner";
import { logger } from "@/server/security/logger";

export interface InboundWorkflowMessage {
  projectId: string;
  phoneNumberId: string;
  customerPhone: string;
  messageText: string;
  replyId?: string | null;
  wamid: string;
}

export class WorkflowTriggerMatcher {
  /**
   * Process inbound customer WhatsApp message against active workflows or waiting runs
   */
  static async processIncoming(params: InboundWorkflowMessage): Promise<void> {
    const { projectId, phoneNumberId, customerPhone, messageText, replyId, wamid } = params;
    void wamid;
    const cleanCustomer = customerPhone.replace(/\D/g, "");

    // 1. Check for active run in 'waiting_reply' status
    try {
      const waitingRuns = await executeQuery<any>(
        `SELECT TOP 1 id, workflow_id, current_node_id, status
         FROM workflow_runs
         WHERE customer_phone = @phone
           AND project_id = @projectId
           AND (phone_number_id = @phoneId OR phone_number_id IS NULL)
           AND status = 'waiting_reply'
         ORDER BY updated_at DESC`,
        {
          phone: { type: sql.NVarChar(50), value: cleanCustomer },
          projectId: { type: sql.NVarChar(64), value: projectId },
          phoneId: { type: sql.NVarChar(64), value: phoneNumberId },
        }
      );

      if (waitingRuns && waitingRuns.length > 0) {
        const activeRun = waitingRuns[0];
        console.log(`[WorkflowTrigger] Resuming waiting run ${activeRun.id} for customer +${cleanCustomer}`);
        await FlowRunner.resumeRun({
          runId: activeRun.id,
          replyText: messageText,
          replyId: replyId || null,
        });
        return;
      }
    } catch (checkErr: any) {
      logger.warn(`[WorkflowTrigger] Error checking active runs: ${checkErr.message}`);
    }

    // 2. No waiting run - search for matching active workflow by trigger & priority
    try {
      const activeWorkflows = await executeQuery<any>(
        `SELECT id, version, trigger_type, trigger_value, priority, graph_json
         FROM workflows
         WHERE project_id = @projectId
           AND (phone_number_id = @phoneId OR phone_number_id IS NULL)
           AND status = 'active'
         ORDER BY priority DESC, created_at ASC`,
        {
          projectId: { type: sql.NVarChar(64), value: projectId },
          phoneId: { type: sql.NVarChar(64), value: phoneNumberId },
        }
      );

      if (!activeWorkflows || activeWorkflows.length === 0) {
        console.log(`[WorkflowTrigger] No active workflows found for project ${projectId}.`);
        return;
      }

      const normalizedInput = (messageText || "").trim().toLowerCase();

      for (const wf of activeWorkflows) {
        let isMatch = false;

        if (wf.trigger_type === "keyword") {
          // Resolve keywords from trigger_value, falling back to graph_json trigger node keyword
          let rawKeywords = wf.trigger_value || "";
          if (!rawKeywords && wf.graph_json) {
            try {
              const g = typeof wf.graph_json === "string" ? JSON.parse(wf.graph_json) : wf.graph_json;
              const tn = g?.nodes?.find((n: any) => n.type === "trigger");
              if (tn?.data?.keyword) {
                rawKeywords = String(tn.data.keyword).trim();
              }
            } catch {}
          }

          const keywords = rawKeywords
            .split(/[,;\n]/)
            .map((k: string) => k.trim().toLowerCase())
            .filter((k: string) => k.length > 0);

          if (keywords.length === 0) {
            // A keyword trigger with no keywords configured MUST NOT capture all incoming messages
            isMatch = false;
          } else {
            // Check if any keyword matches
            isMatch = keywords.some((k: string) => {
              if (normalizedInput === k) return true;
              // Check whole word match or exact substring containment
              if (k.length <= 3) {
                const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const regex = new RegExp(`(^|\\s|\\b)${escaped}(\\b|\\s|$)`, "i");
                return regex.test(normalizedInput);
              }
              return normalizedInput.includes(k);
            });
          }
        } else if (wf.trigger_type === "first_message") {
          // Check if customer has prior messages in WA_MESSAGES
          try {
            const prior = await executeQuery<any>(
              `SELECT TOP 1 message_id FROM WA_MESSAGES
               WHERE customer_id = @custId AND project_id = @projectId`,
              {
                custId: { type: sql.NVarChar(64), value: `cust_${cleanCustomer}` },
                projectId: { type: sql.NVarChar(64), value: projectId },
              }
            );
            // If very few prior messages or matches greeting
            if (!prior || prior.length <= 1) {
              isMatch = true;
            }
          } catch {
            isMatch = true;
          }
        } else if (wf.trigger_type === "any_reply") {
          isMatch = true;
        }

        if (isMatch) {
          console.log(`[WorkflowTrigger] Matched workflow "${wf.id}" (priority ${wf.priority}) for incoming text: "${messageText}"`);
          await FlowRunner.startRun({
            workflowId: wf.id,
            workflowVersion: wf.version,
            projectId,
            phoneNumberId,
            customerPhone: cleanCustomer,
            triggerText: messageText,
          });
          return;
        }
      }

      console.log(`[WorkflowTrigger] No keyword matched incoming text "${messageText}" for project ${projectId}.`);
    } catch (wfErr: any) {
      logger.error(`[WorkflowTrigger] Error searching active workflows: ${wfErr.message}`);
    }
  }
}
