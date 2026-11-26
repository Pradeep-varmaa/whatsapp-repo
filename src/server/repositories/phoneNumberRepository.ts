import { PhoneNumber } from "@/shared/types";
import { executeQuery, sql } from "../database/connection";

export interface ProjectAssignment {
  phoneNumberId: string;
  projectId: string;
  projectName: string;
  isDefault: boolean;
  updatedAt: string;
}

export class PhoneNumberRepository {
  // In-memory fallback stores for when MSSQL is offline/initializing
  private static inMemoryAssignments: Map<string, ProjectAssignment> = new Map();
  private static inMemoryPhoneNumbers: Map<string, PhoneNumber> = new Map();

  /**
   * Retrieves all project-to-phone-number assignments from MSSQL (or in-memory fallback).
   */
  async getProjectAssignments(): Promise<Map<string, ProjectAssignment>> {
    const assignments = new Map<string, ProjectAssignment>();

    try {
      const rows = await executeQuery<any>(
        `SELECT m.phone_number_id, m.project_id, p.name AS project_name, m.created_at, m.updated_at
         FROM WA_PROJECT_MAPPINGS m
         INNER JOIN ENGINE_PROJECTS p ON m.project_id = p.project_id
         WHERE m.is_active = 1`
      );

      if (rows && rows.length > 0) {
        for (const r of rows) {
          assignments.set(r.phone_number_id, {
            phoneNumberId: r.phone_number_id,
            projectId: r.project_id,
            projectName: r.project_name,
            isDefault: false,
            updatedAt: new Date(r.updated_at || r.created_at).toISOString(),
          });
        }
        return assignments;
      }
    } catch {
      // MSSQL offline, use in-memory assignments
    }

    // Merge in-memory assignments
    for (const [key, val] of PhoneNumberRepository.inMemoryAssignments.entries()) {
      if (!assignments.has(key)) {
        assignments.set(key, val);
      }
    }

    return assignments;
  }

  /**
   * Assigns or updates a Phone Number to an internal Project in MSSQL.
   */
  async assignToProject(
    phoneNumberId: string,
    projectId: string,
    projectName: string,
    isDefault = false
  ): Promise<ProjectAssignment> {
    const now = new Date().toISOString();
    const assignment: ProjectAssignment = {
      phoneNumberId,
      projectId,
      projectName,
      isDefault,
      updatedAt: now,
    };

    try {
      // First ensure the phone number exists in WA_PHONE_NUMBERS if foreign key requires it
      await executeQuery(
        `IF NOT EXISTS (SELECT 1 FROM WA_PHONE_NUMBERS WHERE phone_number_id = @phoneId)
         BEGIN
           INSERT INTO WA_PHONE_NUMBERS (phone_number_id, waba_id, display_phone_number, verified_name, quality_rating, code_verification_status, messaging_limit_tier, status, is_default, created_at, updated_at)
           VALUES (@phoneId, 'unknown_waba', @phoneId, @projectName, 'UNKNOWN', 'UNKNOWN', 'NOT_REPORTED', 'CONNECTED', @isDefault, SYSUTCDATETIME(), SYSUTCDATETIME())
         END`,
        {
          phoneId: { type: sql.NVarChar(64), value: phoneNumberId },
          projectName: { type: sql.NVarChar(150), value: projectName },
          isDefault: { type: sql.Bit, value: isDefault ? 1 : 0 },
        }
      );

      // Merge into WA_PROJECT_MAPPINGS
      await executeQuery(
        `MERGE INTO WA_PROJECT_MAPPINGS AS target
         USING (SELECT @phoneId AS phone_number_id) AS source
         ON target.phone_number_id = source.phone_number_id
         WHEN MATCHED THEN
           UPDATE SET project_id = @projectId, is_active = 1, updated_at = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN
           INSERT (mapping_id, project_id, waba_id, phone_number_id, is_active, created_at, updated_at)
           VALUES (@mappingId, @projectId, 'unknown_waba', @phoneId, 1, SYSUTCDATETIME(), SYSUTCDATETIME());`,
        {
          mappingId: { type: sql.NVarChar(64), value: `map_${Date.now()}` },
          projectId: { type: sql.NVarChar(64), value: projectId },
          phoneId: { type: sql.NVarChar(64), value: phoneNumberId },
        }
      );
    } catch (err: any) {
      console.warn("[PhoneNumberRepository] Database mapping update failed, using in-memory store:", err.message);
    }

    PhoneNumberRepository.inMemoryAssignments.set(phoneNumberId, assignment);

    // Also update cached phone number record if present
    const existing = PhoneNumberRepository.inMemoryPhoneNumbers.get(phoneNumberId);
    if (existing) {
      existing.projectId = projectId;
      existing.projectName = projectName;
      existing.isDefault = isDefault;
      existing.updatedAt = now;
      PhoneNumberRepository.inMemoryPhoneNumbers.set(phoneNumberId, existing);
    }

    return assignment;
  }

  /**
   * Unassigns a Phone Number from its project.
   */
  async unassignFromProject(phoneNumberId: string): Promise<boolean> {
    try {
      await executeQuery(
        `UPDATE WA_PROJECT_MAPPINGS
         SET is_active = 0, updated_at = SYSUTCDATETIME()
         WHERE phone_number_id = @phoneId`,
        { phoneId: { type: sql.NVarChar(64), value: phoneNumberId } }
      );
    } catch {
      // Fallback
    }

    PhoneNumberRepository.inMemoryAssignments.delete(phoneNumberId);
    const existing = PhoneNumberRepository.inMemoryPhoneNumbers.get(phoneNumberId);
    if (existing) {
      existing.projectId = null;
      existing.projectName = null;
    }
    return true;
  }

  /**
   * Caches or updates Meta phone number details in MSSQL without deleting historical records.
   */
  async savePhoneNumbersCache(numbers: PhoneNumber[]): Promise<void> {
    for (const num of numbers) {
      PhoneNumberRepository.inMemoryPhoneNumbers.set(num.phoneNumberId, num);

      try {
        await executeQuery(
          `MERGE INTO WA_PHONE_NUMBERS AS target
           USING (SELECT @phoneId AS phone_number_id) AS source
           ON target.phone_number_id = source.phone_number_id
           WHEN MATCHED THEN
             UPDATE SET
               waba_id = COALESCE(@wabaId, target.waba_id),
               display_phone_number = @displayPhone,
               verified_name = @verifiedName,
               quality_rating = @quality,
               code_verification_status = @codeVer,
               messaging_limit_tier = @limitTier,
               status = @status,
               updated_at = SYSUTCDATETIME()
           WHEN NOT MATCHED THEN
             INSERT (phone_number_id, waba_id, display_phone_number, verified_name, quality_rating, code_verification_status, messaging_limit_tier, status, is_default, created_at, updated_at)
             VALUES (@phoneId, @wabaId, @displayPhone, @verifiedName, @quality, @codeVer, @limitTier, @status, @isDefault, SYSUTCDATETIME(), SYSUTCDATETIME());`,
          {
            phoneId: { type: sql.NVarChar(64), value: num.phoneNumberId },
            wabaId: { type: sql.NVarChar(64), value: num.wabaId || "unknown_waba" },
            displayPhone: { type: sql.NVarChar(50), value: num.displayPhoneNumber || "" },
            verifiedName: { type: sql.NVarChar(150), value: num.verifiedName || "" },
            quality: { type: sql.NVarChar(20), value: num.qualityRating || "UNKNOWN" },
            codeVer: { type: sql.NVarChar(30), value: num.codeVerificationStatus || "UNKNOWN" },
            limitTier: { type: sql.NVarChar(50), value: num.messagingLimitTier || "NOT_REPORTED" },
            status: { type: sql.NVarChar(30), value: num.status || "CONNECTED" },
            isDefault: { type: sql.Bit, value: num.isDefault ? 1 : 0 },
          }
        );
      } catch {
        // Fallback
      }
    }
  }

  /**
   * Retrieves all cached phone numbers with their assigned projects from MSSQL.
   */
  async findAll(): Promise<PhoneNumber[]> {
    try {
      const rows = await executeQuery<any>(
        `SELECT n.phone_number_id, n.waba_id, a.account_name AS waba_name, n.display_phone_number,
                n.verified_name, n.quality_rating, n.code_verification_status, n.messaging_limit_tier,
                n.status, n.is_default, n.created_at, n.updated_at,
                m.project_id, p.name AS project_name
         FROM WA_PHONE_NUMBERS n
         LEFT JOIN WA_BUSINESS_ACCOUNTS a ON n.waba_id = a.waba_id
         LEFT JOIN WA_PROJECT_MAPPINGS m ON n.phone_number_id = m.phone_number_id AND m.is_active = 1
         LEFT JOIN ENGINE_PROJECTS p ON m.project_id = p.project_id
         ORDER BY n.created_at DESC`
      );

      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          phoneNumberId: r.phone_number_id,
          wabaId: r.waba_id,
          wabaName: r.waba_name || "WhatsApp Business Account",
          displayPhoneNumber: r.display_phone_number,
          verifiedName: r.verified_name,
          qualityRating: r.quality_rating,
          codeVerificationStatus: r.code_verification_status,
          messagingLimitTier: r.messaging_limit_tier,
          status: r.status,
          isDefault: Boolean(r.is_default),
          projectId: r.project_id,
          projectName: r.project_name,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        }));
      }
    } catch {
      // In-memory fallback
    }

    return Array.from(PhoneNumberRepository.inMemoryPhoneNumbers.values());
  }

  async findById(phoneNumberId: string): Promise<PhoneNumber | null> {
    const list = await this.findAll();
    return list.find((p) => p.phoneNumberId === phoneNumberId) || null;
  }

  async findByProjectId(projectId: string): Promise<PhoneNumber[]> {
    const list = await this.findAll();
    return list.filter((p) => p.projectId === projectId);
  }

  async findByNumberOrId(identifier: string): Promise<PhoneNumber | null> {
    const list = await this.findAll();
    const cleanId = identifier.replace(/\D/g, "");
    return (
      list.find(
        (p) =>
          p.phoneNumberId === identifier ||
          p.displayPhoneNumber === identifier ||
          p.displayPhoneNumber.replace(/\D/g, "") === cleanId
      ) || null
    );
  }

  async create(number: PhoneNumber): Promise<PhoneNumber> {
    PhoneNumberRepository.inMemoryPhoneNumbers.set(number.phoneNumberId, number);

    try {
      await executeQuery(
        `INSERT INTO WA_PHONE_NUMBERS (phone_number_id, waba_id, display_phone_number, verified_name, quality_rating, code_verification_status, messaging_limit_tier, status, is_default, created_at, updated_at)
         VALUES (@phoneId, @wabaId, @displayPhone, @verifiedName, @quality, @codeVer, @limitTier, @status, @isDefault, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        {
          phoneId: { type: sql.NVarChar(64), value: number.phoneNumberId },
          wabaId: { type: sql.NVarChar(64), value: number.wabaId || "unknown_waba" },
          displayPhone: { type: sql.NVarChar(50), value: number.displayPhoneNumber },
          verifiedName: { type: sql.NVarChar(150), value: number.verifiedName },
          quality: { type: sql.NVarChar(20), value: number.qualityRating || "UNKNOWN" },
          codeVer: { type: sql.NVarChar(30), value: number.codeVerificationStatus || "UNKNOWN" },
          limitTier: { type: sql.NVarChar(30), value: number.messagingLimitTier || "TIER_100K" },
          status: { type: sql.NVarChar(30), value: number.status || "CONNECTED" },
          isDefault: { type: sql.Bit, value: number.isDefault ? 1 : 0 },
        }
      );
    } catch {
      // In-memory fallback
    }

    return number;
  }

  async upsertFromWebhook(phoneId: string, displayPhone: string, wabaId?: string): Promise<PhoneNumber> {
    const existing =
      (await this.findByNumberOrId(phoneId)) ||
      (displayPhone ? await this.findByNumberOrId(displayPhone) : null);
    if (existing) {
      return existing;
    }
    const newPhone: PhoneNumber = {
      phoneNumberId: phoneId,
      wabaId: wabaId || "waba_whatsapp_cloud",
      wabaName: "WhatsApp Cloud WABA",
      displayPhoneNumber: displayPhone || phoneId,
      verifiedName: "WhatsApp Verified Sender",
      qualityRating: "GREEN",
      codeVerificationStatus: "VERIFIED",
      messagingLimitTier: "TIER_100K",
      status: "CONNECTED",
      isDefault: PhoneNumberRepository.inMemoryPhoneNumbers.size === 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return await this.create(newPhone);
  }
}
