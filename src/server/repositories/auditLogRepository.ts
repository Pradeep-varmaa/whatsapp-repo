import { executeQuery, sql } from "../database/connection";
import { AuditLogRecord, AuditLogItem } from "@/shared/types";

export interface CreateAuditLogInput {
  request_id: string;
  event: string;
  outcome: "success" | "failure";
  reason?: string | null;
  key_prefix?: string | null;
  api_key_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  endpoint: string;
  http_status: number;
  recipient_masked?: string | null;
  meta_message_id?: string | null;
  error_summary?: string | null;
}

export interface AuditLogFilter {
  outcome?: string; // "all" | "success" | "failure"
  event?: string;
  keyPrefix?: string;
  api_key_id?: string;
  apiKeyId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export class AuditLogRepository {
  private static inMemory: AuditLogRecord[] = [];

  /**
   * Reset in-memory audit logs (useful for unit tests)
   */
  static resetMemory() {
    AuditLogRepository.inMemory = [];
  }

  /**
   * Append-only log creation: inserts a new audit log record
   */
  async create(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    const id = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = new Date().toISOString();

    const record: AuditLogRecord = {
      id,
      request_id: input.request_id,
      timestamp,
      event: input.event,
      outcome: input.outcome,
      reason: input.reason || null,
      key_prefix: input.key_prefix || null,
      api_key_id: input.api_key_id || null,
      ip: input.ip || null,
      user_agent: input.user_agent ? input.user_agent.slice(0, 500) : null,
      endpoint: input.endpoint,
      http_status: input.http_status,
      recipient_masked: input.recipient_masked || null,
      meta_message_id: input.meta_message_id || null,
      error_summary: input.error_summary ? input.error_summary.slice(0, 1000) : null,
    };

    // 1. Persist to database if available
    try {
      await executeQuery(
        `INSERT INTO audit_logs (
           id, request_id, timestamp, event, outcome, reason,
           key_prefix, api_key_id, ip, user_agent, endpoint,
           http_status, recipient_masked, meta_message_id, error_summary
         ) VALUES (
           @id, @requestId, SYSUTCDATETIME(), @event, @outcome, @reason,
           @keyPrefix, @apiKeyId, @ip, @userAgent, @endpoint,
           @httpStatus, @recipientMasked, @metaMessageId, @errorSummary
         )`,
        {
          id: { type: sql.NVarChar(64), value: record.id },
          requestId: { type: sql.NVarChar(64), value: record.request_id },
          event: { type: sql.NVarChar(50), value: record.event },
          outcome: { type: sql.NVarChar(20), value: record.outcome },
          reason: { type: sql.NVarChar(50), value: record.reason },
          keyPrefix: { type: sql.NVarChar(16), value: record.key_prefix },
          apiKeyId: { type: sql.NVarChar(64), value: record.api_key_id },
          ip: { type: sql.NVarChar(45), value: record.ip },
          userAgent: { type: sql.NVarChar(500), value: record.user_agent },
          endpoint: { type: sql.NVarChar(255), value: record.endpoint },
          httpStatus: { type: sql.Int, value: record.http_status },
          recipientMasked: { type: sql.NVarChar(50), value: record.recipient_masked },
          metaMessageId: { type: sql.NVarChar(128), value: record.meta_message_id },
          errorSummary: { type: sql.NVarChar(1000), value: record.error_summary },
        }
      );
    } catch {
      // In-memory fallback
    }

    // 2. Keep in-memory mirror
    AuditLogRepository.inMemory.unshift(record);

    return record;
  }

  /**
   * Filter and paginate audit logs
   */
  async find(filter: AuditLogFilter = {}): Promise<{ logs: AuditLogRecord[]; total: number }> {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.max(1, Math.min(100, filter.limit || 20));
    const offset = (page - 1) * limit;

    try {
      let whereClause = "WHERE 1=1";
      const params: Record<string, { type: any; value: any }> = {};

      if (filter.outcome && filter.outcome !== "all") {
        whereClause += " AND outcome = @outcome";
        params.outcome = { type: sql.NVarChar(20), value: filter.outcome };
      }

      if (filter.event && filter.event !== "all") {
        whereClause += " AND event = @event";
        params.event = { type: sql.NVarChar(50), value: filter.event };
      }

      if (filter.keyPrefix) {
        whereClause += " AND (key_prefix LIKE @keyPrefix + '%' OR @keyPrefix LIKE key_prefix + '%')";
        params.keyPrefix = { type: sql.NVarChar(16), value: filter.keyPrefix };
      }

      const keyId = filter.apiKeyId || filter.api_key_id;
      if (keyId) {
        whereClause += " AND api_key_id = @apiKeyId";
        params.apiKeyId = { type: sql.NVarChar(64), value: keyId };
      }

      if (filter.startDate) {
        whereClause += " AND timestamp >= @startDate";
        params.startDate = { type: sql.DateTime2, value: new Date(filter.startDate) };
      }

      if (filter.endDate) {
        whereClause += " AND timestamp <= @endDate";
        params.endDate = { type: sql.DateTime2, value: new Date(filter.endDate) };
      }

      const countRows = await executeQuery<{ total: number }>(
        `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`,
        params
      );
      const total = countRows?.[0]?.total || 0;

      const dataRows = await executeQuery<any>(
        `SELECT id, request_id, timestamp, event, outcome, reason,
                key_prefix, api_key_id, ip, user_agent, endpoint,
                http_status, recipient_masked, meta_message_id, error_summary
         FROM audit_logs
         ${whereClause}
         ORDER BY timestamp DESC
         OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`,
        params
      );

      return {
        logs: (dataRows || []).map((r) => this.mapRow(r)),
        total,
      };
    } catch {
      // In-memory fallback
    }

    let filtered = [...AuditLogRepository.inMemory];

    if (filter.outcome && filter.outcome !== "all") {
      filtered = filtered.filter((l) => l.outcome === filter.outcome);
    }
    if (filter.event && filter.event !== "all") {
      filtered = filtered.filter((l) => l.event === filter.event);
    }
    if (filter.keyPrefix) {
      filtered = filtered.filter(
        (l) => l.key_prefix && (l.key_prefix.includes(filter.keyPrefix!) || filter.keyPrefix!.includes(l.key_prefix))
      );
    }
    const keyIdFilter = filter.apiKeyId || filter.api_key_id;
    if (keyIdFilter) {
      filtered = filtered.filter((l) => l.api_key_id === keyIdFilter);
    }
    if (filter.startDate) {
      const start = new Date(filter.startDate).getTime();
      filtered = filtered.filter((l) => new Date(l.timestamp).getTime() >= start);
    }
    if (filter.endDate) {
      const end = new Date(filter.endDate).getTime();
      filtered = filtered.filter((l) => new Date(l.timestamp).getTime() <= end);
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return { logs: paginated, total };
  }

  /**
   * Count total failed requests (from real audit data)
   */
  async countFailures(): Promise<number> {
    try {
      const rows = await executeQuery<{ total: number }>(
        `SELECT COUNT(*) as total FROM audit_logs WHERE outcome = 'failure'`
      );
      if (rows && rows.length > 0) {
        return rows[0].total;
      }
    } catch {
      // In-memory fallback
    }

    return AuditLogRepository.inMemory.filter((l) => l.outcome === "failure").length;
  }

  /**
   * Export logs as CSV format for superadmin
   */
  async exportCsv(filter: AuditLogFilter = {}): Promise<string> {
    const { logs } = await this.find({ ...filter, page: 1, limit: 10000 });

    const headers = [
      "ID",
      "Timestamp",
      "Request ID",
      "Event",
      "Outcome",
      "Reason",
      "Key Prefix",
      "API Key ID",
      "IP Address",
      "User Agent",
      "Endpoint",
      "HTTP Status",
      "Recipient (Masked)",
      "Meta Message ID",
      "Error Summary",
    ];

    const escapeCsv = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const lines = [headers.join(",")];
    for (const log of logs) {
      lines.push(
        [
          escapeCsv(log.id),
          escapeCsv(log.timestamp),
          escapeCsv(log.request_id),
          escapeCsv(log.event),
          escapeCsv(log.outcome),
          escapeCsv(log.reason),
          escapeCsv(log.key_prefix),
          escapeCsv(log.api_key_id),
          escapeCsv(log.ip),
          escapeCsv(log.user_agent),
          escapeCsv(log.endpoint),
          escapeCsv(log.http_status),
          escapeCsv(log.recipient_masked),
          escapeCsv(log.meta_message_id),
          escapeCsv(log.error_summary),
        ].join(",")
      );
    }

    return lines.join("\n");
  }

  /**
   * Backwards compatibility helper
   */
  async findAll(options?: { projectId?: string; action?: string }): Promise<AuditLogItem[]> {
    const { logs } = await this.find({ event: options?.action });
    return logs.map((l) => ({
      logId: l.id,
      action: l.event,
      resourceType: "api_key",
      resourceId: l.api_key_id,
      status: l.outcome,
      ipAddress: l.ip,
      userAgent: l.user_agent,
      createdAt: l.timestamp,
    }));
  }

  private mapRow(r: any): AuditLogRecord {
    return {
      id: r.id,
      request_id: r.request_id,
      timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
      event: r.event,
      outcome: r.outcome === "success" ? "success" : "failure",
      reason: r.reason || null,
      key_prefix: r.key_prefix || null,
      api_key_id: r.api_key_id || null,
      ip: r.ip || null,
      user_agent: r.user_agent || null,
      endpoint: r.endpoint || "/api/v1/messages",
      http_status: Number(r.http_status || 200),
      recipient_masked: r.recipient_masked || null,
      meta_message_id: r.meta_message_id || null,
      error_summary: r.error_summary || null,
    };
  }
}
