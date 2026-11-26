import { RequestLog } from "@/shared/types";
import { executeQuery, sql } from "../database/connection";

export class RequestLogRepository {
  private static inMemory: RequestLog[] = [];
  private static dynamicWebhookRoutes: Map<string, string> = new Map();

  /**
   * Register a dynamic webhook route from a server request
   * So when that recipient phone replies, we dynamically know where to redirect
   */
  registerDynamicRoute(recipientPhone: string, webhookUrl: string, phoneNumberId?: string) {
    if (recipientPhone && webhookUrl) {
      RequestLogRepository.dynamicWebhookRoutes.set(recipientPhone.replace(/\D/g, ""), webhookUrl);
      RequestLogRepository.dynamicWebhookRoutes.set(recipientPhone, webhookUrl);
    }
    if (phoneNumberId && webhookUrl) {
      RequestLogRepository.dynamicWebhookRoutes.set(phoneNumberId, webhookUrl);
    }
  }

  /**
   * Resolve dynamic webhook route for an inbound reply
   */
  getDynamicRoute(key: string): string | null {
    if (!key) return null;
    const clean = key.replace(/\D/g, "");
    return (
      RequestLogRepository.dynamicWebhookRoutes.get(key) ||
      RequestLogRepository.dynamicWebhookRoutes.get(clean) ||
      null
    );
  }

  async findAll(filter?: {
    source?: "server" | "user";
    direction?: "outbound" | "inbound";
    search?: string;
    limit?: number;
  }): Promise<RequestLog[]> {
    try {
      let query = `
        SELECT request_id, source, direction, from_number, to_number, phone_number_id,
               message_text, message_type, webhook_url, forward_status, forward_status_code,
               forward_response_body, status, wamid, error_code, error_message,
               metadata_json, raw_payload_json, created_at
        FROM ENGINE_REQUEST_LOGS
        WHERE 1=1
      `;
      const params: Record<string, { type: sql.ISqlType; value: any }> = {};

      if (filter?.source) {
        query += ` AND source = @source`;
        params.source = { type: sql.NVarChar(20), value: filter.source };
      }
      if (filter?.direction) {
        query += ` AND direction = @direction`;
        params.direction = { type: sql.NVarChar(20), value: filter.direction };
      }
      query += ` ORDER BY created_at DESC`;

      const rows = await executeQuery<any>(query, params);
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          requestId: r.request_id,
          source: r.source,
          direction: r.direction,
          from: r.from_number,
          to: r.to_number,
          phoneNumberId: r.phone_number_id,
          message: r.message_text,
          messageType: r.message_type,
          webhookUrl: r.webhook_url,
          forwardStatus: r.forward_status,
          forwardStatusCode: r.forward_status_code,
          forwardResponseBody: r.forward_response_body ? JSON.parse(r.forward_response_body) : null,
          status: r.status,
          wamid: r.wamid,
          errorCode: r.error_code,
          errorMessage: r.error_message,
          metadata: r.metadata_json ? JSON.parse(r.metadata_json) : null,
          rawPayload: r.raw_payload_json ? JSON.parse(r.raw_payload_json) : null,
          timestamp: new Date(r.created_at).toISOString(),
        }));
      }
    } catch {
      // In-memory fallback
    }

    let results = [...RequestLogRepository.inMemory];
    if (filter?.source) {
      results = results.filter((r) => r.source === filter.source);
    }
    if (filter?.direction) {
      results = results.filter((r) => r.direction === filter.direction);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      results = results.filter(
        (r) =>
          r.from.toLowerCase().includes(q) ||
          r.to.toLowerCase().includes(q) ||
          r.message.toLowerCase().includes(q) ||
          (r.webhookUrl && r.webhookUrl.toLowerCase().includes(q))
      );
    }
    return results;
  }

  async findById(requestId: string): Promise<RequestLog | null> {
    const list = await this.findAll();
    return list.find((r) => r.requestId === requestId) || null;
  }

  async create(log: RequestLog): Promise<RequestLog> {
    try {
      await executeQuery(
        `INSERT INTO ENGINE_REQUEST_LOGS (
          request_id, source, direction, from_number, to_number, phone_number_id,
          message_text, message_type, webhook_url, forward_status, forward_status_code,
          status, wamid, error_code, error_message, metadata_json, raw_payload_json, created_at
        ) VALUES (
          @id, @source, @dir, @from, @to, @phoneId,
          @msg, @type, @webhook, @forwardStatus, @forwardCode,
          @status, @wamid, @errCode, @errMsg, @meta, @raw, @createdAt
        )`,
        {
          id: { type: sql.NVarChar(64), value: log.requestId },
          source: { type: sql.NVarChar(20), value: log.source },
          dir: { type: sql.NVarChar(20), value: log.direction },
          from: { type: sql.NVarChar(50), value: log.from },
          to: { type: sql.NVarChar(50), value: log.to },
          phoneId: { type: sql.NVarChar(64), value: log.phoneNumberId || null },
          msg: { type: sql.NVarChar(sql.MAX), value: log.message },
          type: { type: sql.NVarChar(30), value: log.messageType || "text" },
          webhook: { type: sql.NVarChar(500), value: log.webhookUrl || null },
          forwardStatus: { type: sql.NVarChar(30), value: log.forwardStatus || null },
          forwardCode: { type: sql.Int, value: log.forwardStatusCode || null },
          status: { type: sql.NVarChar(30), value: log.status },
          wamid: { type: sql.NVarChar(128), value: log.wamid || null },
          errCode: { type: sql.NVarChar(50), value: log.errorCode || null },
          errMsg: { type: sql.NVarChar(sql.MAX), value: log.errorMessage || null },
          meta: { type: sql.NVarChar(sql.MAX), value: log.metadata ? JSON.stringify(log.metadata) : null },
          raw: { type: sql.NVarChar(sql.MAX), value: log.rawPayload ? JSON.stringify(log.rawPayload) : null },
          createdAt: { type: sql.DateTime2, value: new Date(log.timestamp) },
        }
      );
    } catch {
      // In-memory fallback
    }

    RequestLogRepository.inMemory.unshift(log);
    return log;
  }
}
