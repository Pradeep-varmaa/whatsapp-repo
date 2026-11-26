import { executeQuery, sql } from "../database/connection";
import { ApiKeyRecord, ApiKeyItem } from "@/shared/types";

export interface CreateApiKeyInput {
  id?: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  phone_number_id: string;
  project_id?: string | null;
  allowed_recipients?: string[] | null;
  scopes?: string[];
  rate_limit_per_minute?: number;
  expires_at?: string | null;
  created_by?: string;
  raw_key?: string;
}

export interface UpdateApiKeyInput {
  name?: string;
  allowed_recipients?: string[] | null;
  rate_limit_per_minute?: number;
  expires_at?: string | null;
}

export interface UpdateApiKeyResult {
  record: ApiKeyRecord;
  changedFields: string[];
}

export class ApiKeyRepository {
  private static inMemory: ApiKeyRecord[] = [];

  /**
   * Reset in-memory storage (useful for tests)
   */
  static resetMemory() {
    ApiKeyRepository.inMemory = [];
  }

  /**
   * Create a new API key record
   */
  async create(input: CreateApiKeyInput): Promise<ApiKeyRecord> {
    const id = input.id || `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const scopes = input.scopes && input.scopes.length > 0 ? input.scopes : ["messages:send"];
    const rateLimit = input.rate_limit_per_minute ?? 60;

    const record: ApiKeyRecord = {
      id,
      name: input.name,
      key_prefix: input.key_prefix,
      key_hash: input.key_hash,
      phone_number_id: input.phone_number_id,
      project_id: input.project_id || null,
      allowed_recipients: input.allowed_recipients || null,
      scopes,
      rate_limit_per_minute: rateLimit,
      expires_at: input.expires_at || null,
      revoked_at: null,
      last_used_at: null,
      created_by: input.created_by || "system",
      created_at: now,
      raw_key: input.raw_key,
    };

    // 1. Try persisting to MSSQL database if available
    try {
      await executeQuery(
        `INSERT INTO api_keys (
           id, name, key_prefix, key_hash, phone_number_id, project_id,
           allowed_recipients, scopes, rate_limit_per_minute, expires_at,
           revoked_at, last_used_at, created_by, created_at
         ) VALUES (
           @id, @name, @prefix, @hash, @phone, @proj,
           @recipients, @scopes, @rateLimit, @expiresAt,
           NULL, NULL, @createdBy, SYSUTCDATETIME()
         )`,
        {
          id: { type: sql.NVarChar(64), value: record.id },
          name: { type: sql.NVarChar(150), value: record.name },
          prefix: { type: sql.NVarChar(16), value: record.key_prefix },
          hash: { type: sql.NVarChar(255), value: record.key_hash },
          phone: { type: sql.NVarChar(64), value: record.phone_number_id },
          proj: { type: sql.NVarChar(64), value: record.project_id },
          recipients: {
            type: sql.NVarChar(sql.MAX),
            value: record.allowed_recipients ? JSON.stringify(record.allowed_recipients) : null,
          },
          scopes: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(record.scopes) },
          rateLimit: { type: sql.Int, value: record.rate_limit_per_minute },
          expiresAt: {
            type: sql.DateTime2,
            value: record.expires_at ? new Date(record.expires_at) : null,
          },
          createdBy: { type: sql.NVarChar(64), value: record.created_by },
        }
      );
    } catch {
      // Database unavailable, fallback to in-memory
    }

    // 2. Keep in-memory mirror
    const existingIdx = ApiKeyRepository.inMemory.findIndex((k) => k.id === record.id);
    if (existingIdx !== -1) {
      ApiKeyRepository.inMemory[existingIdx] = record;
    } else {
      ApiKeyRepository.inMemory.unshift(record);
    }

    return record;
  }

  /**
   * Look up candidate API keys by key prefix
   */
  async findByPrefix(prefix: string): Promise<ApiKeyRecord[]> {
    const cleanPrefix = prefix.trim();

    // 1. Try querying MSSQL
    try {
      const rows = await executeQuery<any>(
        `SELECT id, name, key_prefix, key_hash, phone_number_id, project_id,
                allowed_recipients, scopes, rate_limit_per_minute, expires_at,
                revoked_at, last_used_at, created_by, created_at
         FROM api_keys
         WHERE key_prefix = @prefix
            OR key_prefix LIKE @prefix + '%'
            OR @prefix LIKE key_prefix + '%'`,
        { prefix: { type: sql.NVarChar(16), value: cleanPrefix } }
      );

      if (rows && rows.length > 0) {
        return rows.map((r) => this.mapRow(r));
      }
    } catch {
      // Database fallback
    }

    // 2. Fallback to in-memory
    return ApiKeyRepository.inMemory.filter((k) => {
      return (
        k.key_prefix === cleanPrefix ||
        k.key_prefix.startsWith(cleanPrefix) ||
        cleanPrefix.startsWith(k.key_prefix)
      );
    });
  }

  /**
   * Find key by ID
   */
  async findById(id: string): Promise<ApiKeyRecord | null> {
    try {
      const rows = await executeQuery<any>(
        `SELECT id, name, key_prefix, key_hash, phone_number_id, project_id,
                allowed_recipients, scopes, rate_limit_per_minute, expires_at,
                revoked_at, last_used_at, created_by, created_at
         FROM api_keys WHERE id = @id`,
        { id: { type: sql.NVarChar(64), value: id } }
      );
      if (rows && rows.length > 0) {
        return this.mapRow(rows[0]);
      }
    } catch {
      // Fallback
    }

    const found = ApiKeyRepository.inMemory.find((k) => k.id === id);
    return found || null;
  }

  /**
   * List all keys (never returns key_hash)
   */
  async listAll(filter?: { projectId?: string }): Promise<Omit<ApiKeyRecord, "key_hash">[]> {
    let results: ApiKeyRecord[] = [];

    try {
      let query = `
        SELECT id, name, key_prefix, '' as key_hash, phone_number_id, project_id,
               allowed_recipients, scopes, rate_limit_per_minute, expires_at,
               revoked_at, last_used_at, created_by, created_at
        FROM api_keys
        WHERE 1=1
      `;
      const params: Record<string, { type: any; value: any }> = {};

      if (filter?.projectId) {
        query += ` AND project_id = @proj`;
        params.proj = { type: sql.NVarChar(64), value: filter.projectId };
      }
      query += ` ORDER BY created_at DESC`;

      const rows = await executeQuery<any>(query, params);
      if (rows && rows.length > 0) {
        results = rows.map((r) => this.mapRow(r));
      }
    } catch {
      results = [...ApiKeyRepository.inMemory];
      if (filter?.projectId) {
        results = results.filter((k) => k.project_id === filter.projectId);
      }
    }

    if (results.length === 0 && ApiKeyRepository.inMemory.length > 0) {
      results = [...ApiKeyRepository.inMemory];
      if (filter?.projectId) {
        results = results.filter((k) => k.project_id === filter.projectId);
      }
    }

    // Strip key_hash for security
    return results.map(({ key_hash: _, ...safeKey }) => safeKey);
  }

  /**
   * Update an existing API key
   * Restricted to name, allowed_recipients, rate_limit_per_minute, and expires_at.
   * Never alters key_secret, key_hash, key_prefix, or phone_number_id.
   */
  async update(id: string, input: UpdateApiKeyInput): Promise<UpdateApiKeyResult | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const changedFields: string[] = [];

    if (input.name !== undefined && input.name !== existing.name) {
      changedFields.push("name");
    }

    if (input.allowed_recipients !== undefined) {
      const oldRec = existing.allowed_recipients ? JSON.stringify([...existing.allowed_recipients].sort()) : null;
      const newRec = input.allowed_recipients ? JSON.stringify([...input.allowed_recipients].sort()) : null;
      if (oldRec !== newRec) {
        changedFields.push("allowed_recipients");
      }
    }

    if (input.rate_limit_per_minute !== undefined && Number(input.rate_limit_per_minute) !== Number(existing.rate_limit_per_minute)) {
      changedFields.push("rate_limit_per_minute");
    }

    if (input.expires_at !== undefined) {
      const oldExp = existing.expires_at ? new Date(existing.expires_at).toISOString() : null;
      const newExp = input.expires_at ? new Date(input.expires_at).toISOString() : null;
      if (oldExp !== newExp) {
        changedFields.push("expires_at");
      }
    }

    const updatedName = input.name !== undefined ? input.name : existing.name;
    const updatedAllowedRecipients = input.allowed_recipients !== undefined ? input.allowed_recipients : existing.allowed_recipients;
    const updatedRateLimit = input.rate_limit_per_minute !== undefined ? Number(input.rate_limit_per_minute) : existing.rate_limit_per_minute;
    const updatedExpiresAt = input.expires_at !== undefined ? (input.expires_at ? new Date(input.expires_at).toISOString() : null) : existing.expires_at;

    // 1. Persist to database if available
    try {
      await executeQuery(
        `UPDATE api_keys
         SET name = @name,
             allowed_recipients = @recipients,
             rate_limit_per_minute = @rateLimit,
             expires_at = @expiresAt
         WHERE id = @id`,
        {
          id: { type: sql.NVarChar(64), value: id },
          name: { type: sql.NVarChar(150), value: updatedName },
          recipients: {
            type: sql.NVarChar(sql.MAX),
            value: updatedAllowedRecipients ? JSON.stringify(updatedAllowedRecipients) : null,
          },
          rateLimit: { type: sql.Int, value: updatedRateLimit },
          expiresAt: {
            type: sql.DateTime2,
            value: updatedExpiresAt ? new Date(updatedExpiresAt) : null,
          },
        }
      );
    } catch {
      // In-memory fallback
    }

    // 2. Update in-memory mirror
    const inMem = ApiKeyRepository.inMemory.find((k) => k.id === id);
    if (inMem) {
      inMem.name = updatedName;
      inMem.allowed_recipients = updatedAllowedRecipients;
      inMem.rate_limit_per_minute = updatedRateLimit;
      inMem.expires_at = updatedExpiresAt;
    }

    const updatedRecord: ApiKeyRecord = {
      ...existing,
      name: updatedName,
      allowed_recipients: updatedAllowedRecipients,
      rate_limit_per_minute: updatedRateLimit,
      expires_at: updatedExpiresAt,
    };

    return { record: updatedRecord, changedFields };
  }

  /**
   * Revoke an API key
   */
  async revoke(id: string): Promise<boolean> {
    const now = new Date().toISOString();

    try {
      await executeQuery(
        `UPDATE api_keys SET revoked_at = SYSUTCDATETIME() WHERE id = @id`,
        { id: { type: sql.NVarChar(64), value: id } }
      );
    } catch {
      // In-memory fallback
    }

    const item = ApiKeyRepository.inMemory.find((k) => k.id === id);
    if (item) {
      item.revoked_at = now;
      return true;
    }
    return true;
  }

  /**
   * Update last_used_at
   */
  async updateLastUsed(id: string): Promise<void> {
    const now = new Date().toISOString();

    try {
      await executeQuery(
        `UPDATE api_keys SET last_used_at = SYSUTCDATETIME() WHERE id = @id`,
        { id: { type: sql.NVarChar(64), value: id } }
      );
    } catch {
      // In-memory fallback
    }

    const item = ApiKeyRepository.inMemory.find((k) => k.id === id);
    if (item) {
      item.last_used_at = now;
    }
  }

  /**
   * Legacy method for backwards compatibility with existing UI
   */
  async findAll(projectId?: string): Promise<ApiKeyItem[]> {
    const keys = await this.listAll(projectId ? { projectId } : undefined);
    return keys.map((k) => {
      let status: 'active' | 'revoked' | 'expired' = 'active';
      if (k.revoked_at) {
        status = 'revoked';
      } else if (k.expires_at && new Date(k.expires_at).getTime() < Date.now()) {
        status = 'expired';
      }

      return {
        keyId: k.id,
        projectId: k.project_id || '',
        projectName: k.project_id || 'Global',
        keyName: k.name,
        keyPrefix: k.key_prefix,
        scopes: k.scopes,
        status,
        expiresAt: k.expires_at,
        lastUsedAt: k.last_used_at,
        createdAt: k.created_at,
        rawKey: k.raw_key,
      };
    });
  }

  private mapRow(r: any): ApiKeyRecord {
    let allowedRecipients: string[] | null = null;
    if (r.allowed_recipients) {
      try {
        allowedRecipients = typeof r.allowed_recipients === 'string'
          ? JSON.parse(r.allowed_recipients)
          : r.allowed_recipients;
      } catch {
        allowedRecipients = null;
      }
    }

    let scopes: string[] = ["messages:send"];
    if (r.scopes) {
      try {
        scopes = typeof r.scopes === 'string' ? JSON.parse(r.scopes) : r.scopes;
      } catch {
        scopes = ["messages:send"];
      }
    }

    return {
      id: r.id,
      name: r.name,
      key_prefix: r.key_prefix,
      key_hash: r.key_hash || '',
      phone_number_id: r.phone_number_id,
      project_id: r.project_id || null,
      allowed_recipients: allowedRecipients,
      scopes,
      rate_limit_per_minute: Number(r.rate_limit_per_minute ?? 60),
      expires_at: r.expires_at ? new Date(r.expires_at).toISOString() : null,
      revoked_at: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
      last_used_at: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
      created_by: r.created_by || 'system',
      created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    };
  }
}
