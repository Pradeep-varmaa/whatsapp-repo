import { logger } from "../security/logger";
import { AuditLogRepository, CreateAuditLogInput } from "../repositories/auditLogRepository";
import { AuditLogRecord } from "@/shared/types";

export class AuditService {
  private repo = new AuditLogRepository();

  /**
   * Structured append-only audit logger for public endpoints and key operations.
   * Guaranteed never to throw or leak error details.
   */
  async record(entry: CreateAuditLogInput): Promise<AuditLogRecord | null> {
    try {
      return await this.repo.create(entry);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("Audit logging error (suppressed to caller):", { error: errorMsg });
      return null;
    }
  }
}

export const auditService = new AuditService();
