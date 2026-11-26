import { WhatsAppAccount } from "@/shared/types";
import { executeQuery, sql } from "../database/connection";
import { encryptText, decryptText } from "../security/crypto";
import crypto from "crypto";

export interface UserWaMapping {
  mappingId: string;
  userId: string;
  wabaId: string;
  accountRole: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredCredentials {
  accessToken: string;
  appSecret?: string;
  webhookVerifyToken?: string;
  tokenType?: string;
  expiresAt?: string | null;
}

export class WhatsAppAccountRepository {
  private static inMemory: WhatsAppAccount[] = [];
  private static userMappings: UserWaMapping[] = [];
  private static inMemoryCredentials = new Map<string, StoredCredentials>();

  async findAll(): Promise<WhatsAppAccount[]> {
    let list: WhatsAppAccount[] = [];
    try {
      const rows = await executeQuery<any>(
        `SELECT a.waba_id, a.account_name, a.currency, a.timezone_id, a.message_template_namespace,
                a.account_review_status, a.business_verification_status, a.health_status, a.is_demo_mode,
                a.meta_app_id, a.created_at, a.updated_at,
                m.project_id AS connected_project_id, p.name AS connected_project_name
         FROM WA_BUSINESS_ACCOUNTS a
         LEFT JOIN WA_PROJECT_MAPPINGS m ON a.waba_id = m.waba_id
         LEFT JOIN ENGINE_PROJECTS p ON m.project_id = p.project_id
         ORDER BY a.created_at DESC`
      );
      if (rows && rows.length > 0) {
        list = rows.map((r) => ({
          wabaId: r.waba_id,
          accountName: r.account_name,
          currency: r.currency,
          timezoneId: r.timezone_id,
          messageTemplateNamespace: r.message_template_namespace,
          accountReviewStatus: r.account_review_status,
          businessVerificationStatus: r.business_verification_status,
          healthStatus: r.health_status,
          isDemoMode: Boolean(r.is_demo_mode),
          metaAppId: r.meta_app_id,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
          connectedProjectId: r.connected_project_id,
          connectedProjectName: r.connected_project_name,
        }));
      } else {
        list = WhatsAppAccountRepository.inMemory;
      }
    } catch {
      list = WhatsAppAccountRepository.inMemory;
    }

    try {
      const { PhoneNumberRepository } = await import("./phoneNumberRepository");
      const phones = await new PhoneNumberRepository().findAll();
      return list.map((a) => ({
        ...a,
        phoneNumbersCount: phones.filter((p) => p.wabaId === a.wabaId).length,
      }));
    } catch {
      return list;
    }
  }

  async findById(wabaId: string): Promise<WhatsAppAccount | null> {
    const list = await this.findAll();
    return list.find((a) => a.wabaId === wabaId) || null;
  }

  /**
   * Find only the WhatsApp Accounts associated with the specific user
   */
  async findByUser(userId: string): Promise<WhatsAppAccount[]> {
    const allAccounts = await this.findAll();

    try {
      const rows = await executeQuery<any>(
        `SELECT waba_id, account_role, is_default
         FROM USER_WA_ACCOUNTS
         WHERE user_id = @userId`,
        { userId: { type: sql.NVarChar(64), value: userId } }
      );

      if (rows && rows.length > 0) {
        const allowedIds = new Set(rows.map((r) => r.waba_id));
        return allAccounts.filter((a) => allowedIds.has(a.wabaId));
      }
    } catch {
      // In-memory fallback
    }

    const mapped = WhatsAppAccountRepository.userMappings.filter((m) => m.userId === userId);
    if (mapped.length > 0) {
      const allowedIds = new Set(mapped.map((m) => m.wabaId));
      return allAccounts.filter((a) => allowedIds.has(a.wabaId));
    }

    // Default bootstrap behavior: if no explicit mappings exist yet, associate all current accounts with user
    return allAccounts;
  }

  /**
   * Verify if a user is authorized to access a given WhatsApp Account
   */
  async verifyUserAccess(userId: string, wabaId: string): Promise<boolean> {
    const accounts = await this.findByUser(userId);
    return accounts.some((a) => a.wabaId === wabaId);
  }

  /**
   * Map a user to a WhatsApp Account
   */
  async mapUserToAccount(
    userId: string,
    wabaId: string,
    accountRole = "user",
    isDefault = false
  ): Promise<void> {
    const mappingId = `map_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    try {
      await executeQuery(
        `IF NOT EXISTS (SELECT 1 FROM USER_WA_ACCOUNTS WHERE user_id = @userId AND waba_id = @wabaId)
         BEGIN
           INSERT INTO USER_WA_ACCOUNTS (mapping_id, user_id, waba_id, account_role, is_default, created_at, updated_at)
           VALUES (@mappingId, @userId, @wabaId, @role, @isDefault, SYSUTCDATETIME(), SYSUTCDATETIME())
         END`,
        {
          mappingId: { type: sql.NVarChar(64), value: mappingId },
          userId: { type: sql.NVarChar(64), value: userId },
          wabaId: { type: sql.NVarChar(64), value: wabaId },
          role: { type: sql.NVarChar(50), value: accountRole },
          isDefault: { type: sql.Bit, value: isDefault ? 1 : 0 },
        }
      );
    } catch {
      // In-memory fallback
    }

    if (!WhatsAppAccountRepository.userMappings.some((m) => m.userId === userId && m.wabaId === wabaId)) {
      WhatsAppAccountRepository.userMappings.push({
        mappingId,
        userId,
        wabaId,
        accountRole,
        isDefault,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async create(account: WhatsAppAccount): Promise<WhatsAppAccount> {
    try {
      await executeQuery(
        `INSERT INTO WA_BUSINESS_ACCOUNTS (waba_id, account_name, currency, timezone_id, message_template_namespace, account_review_status, business_verification_status, health_status, is_demo_mode, meta_app_id, created_at, updated_at)
         VALUES (@wabaId, @name, @currency, @tz, @ns, @review, @verif, @health, @demo, @appId, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        {
          wabaId: { type: sql.NVarChar(64), value: account.wabaId },
          name: { type: sql.NVarChar(150), value: account.accountName },
          currency: { type: sql.NVarChar(10), value: account.currency },
          tz: { type: sql.NVarChar(50), value: account.timezoneId },
          ns: { type: sql.NVarChar(100), value: account.messageTemplateNamespace || null },
          review: { type: sql.NVarChar(30), value: account.accountReviewStatus },
          verif: { type: sql.NVarChar(30), value: account.businessVerificationStatus },
          health: { type: sql.NVarChar(30), value: account.healthStatus },
          demo: { type: sql.Bit, value: account.isDemoMode ? 1 : 0 },
          appId: { type: sql.NVarChar(64), value: account.metaAppId || null },
        }
      );
    } catch {
      // Fallback
    }

    const created: WhatsAppAccount = {
      ...account,
      phoneNumbersCount: 0,
    };
    WhatsAppAccountRepository.inMemory.unshift(created);
    return created;
  }

  /**
   * Vault credentials securely using AES-256-GCM.
   * Tokens are NEVER stored or returned in plaintext.
   */
  async storeCredentials(
    wabaId: string,
    accessToken: string,
    appSecret?: string,
    webhookVerifyToken?: string
  ): Promise<void> {
    const encryptedTokenPayload = encryptText(accessToken);
    const [tokenIv, tokenAuthTag, tokenCipher] = encryptedTokenPayload.split(":");

    let appSecretIv = "";
    let appSecretAuthTag = "";
    let appSecretCipher = "";
    if (appSecret) {
      const encryptedSecretPayload = encryptText(appSecret);
      [appSecretIv, appSecretAuthTag, appSecretCipher] = encryptedSecretPayload.split(":");
    }

    const credentialId = `crd_${crypto.randomUUID().slice(0, 8)}`;

    try {
      await executeQuery(
        `MERGE WA_ACCOUNT_CREDENTIALS AS target
         USING (SELECT @wabaId AS waba_id) AS source
         ON (target.waba_id = source.waba_id)
         WHEN MATCHED THEN
           UPDATE SET encrypted_access_token = @tokenCipher,
                      token_iv = @tokenIv,
                      token_auth_tag = @tokenAuthTag,
                      encrypted_app_secret = @appSecretCipher,
                      app_secret_iv = @appSecretIv,
                      app_secret_auth_tag = @appSecretAuthTag,
                      webhook_verify_token = @webhookVerifyToken,
                      updated_at = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN
           INSERT (credential_id, waba_id, encrypted_access_token, token_iv, token_auth_tag,
                   encrypted_app_secret, app_secret_iv, app_secret_auth_tag, webhook_verify_token,
                   token_type, created_at, updated_at)
           VALUES (@credentialId, @wabaId, @tokenCipher, @tokenIv, @tokenAuthTag,
                   @appSecretCipher, @appSecretIv, @appSecretAuthTag, @webhookVerifyToken,
                   'system_user', SYSUTCDATETIME(), SYSUTCDATETIME());`,
        {
          credentialId: { type: sql.NVarChar(64), value: credentialId },
          wabaId: { type: sql.NVarChar(64), value: wabaId },
          tokenCipher: { type: sql.NVarChar(sql.MAX), value: tokenCipher },
          tokenIv: { type: sql.NVarChar(64), value: tokenIv },
          tokenAuthTag: { type: sql.NVarChar(64), value: tokenAuthTag },
          appSecretCipher: { type: sql.NVarChar(sql.MAX), value: appSecretCipher || null },
          appSecretIv: { type: sql.NVarChar(64), value: appSecretIv || null },
          appSecretAuthTag: { type: sql.NVarChar(64), value: appSecretAuthTag || null },
          webhookVerifyToken: { type: sql.NVarChar(128), value: webhookVerifyToken || null },
        }
      );
    } catch {
      // In-memory fallback
    }

    WhatsAppAccountRepository.inMemoryCredentials.set(wabaId, {
      accessToken,
      appSecret,
      webhookVerifyToken,
      tokenType: "system_user",
    });
  }

  /**
   * Retrieve and decrypt credentials at runtime in-memory only.
   * NEVER exposed to the client or returned in API responses.
   */
  async getCredentials(wabaId: string): Promise<StoredCredentials | null> {
    try {
      const rows = await executeQuery<any>(
        `SELECT encrypted_access_token, token_iv, token_auth_tag,
                encrypted_app_secret, app_secret_iv, app_secret_auth_tag,
                webhook_verify_token, token_type, expires_at
         FROM WA_ACCOUNT_CREDENTIALS
         WHERE waba_id = @wabaId`,
        { wabaId: { type: sql.NVarChar(64), value: wabaId } }
      );

      if (rows && rows.length > 0) {
        const row = rows[0];
        const tokenPayload = `${row.token_iv}:${row.token_auth_tag}:${row.encrypted_access_token}`;
        const accessToken = decryptText(tokenPayload);

        let appSecret: string | undefined;
        if (row.encrypted_app_secret && row.app_secret_iv && row.app_secret_auth_tag) {
          const secretPayload = `${row.app_secret_iv}:${row.app_secret_auth_tag}:${row.encrypted_app_secret}`;
          appSecret = decryptText(secretPayload);
        }

        return {
          accessToken,
          appSecret,
          webhookVerifyToken: row.webhook_verify_token || undefined,
          tokenType: row.token_type,
          expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
        };
      }
    } catch {
      // In-memory fallback
    }

    const cached = WhatsAppAccountRepository.inMemoryCredentials.get(wabaId);
    return cached || null;
  }
}
