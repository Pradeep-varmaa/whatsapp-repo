import { PhoneNumber } from "@/shared/types";
import { getMetaGraphApiClient, MetaGraphApiError, MetaPhoneNumberRecord, MetaWabaRecord } from "../integrations/meta/graphApiClient";
import { PhoneNumberRepository } from "../repositories/phoneNumberRepository";
import { ProjectRepository } from "../repositories/projectRepository";
import { getServerConfig } from "../config";

export class WhatsAppDataService {
  private phoneRepo = new PhoneNumberRepository();
  private projectRepo = new ProjectRepository();

  /**
   * Fetches phone numbers dynamically from Meta Graph API v25.0
   * and enriches them with internal project assignments from MSSQL.
   */
  async getPhoneNumbers(options?: { refresh?: boolean; wabaId?: string; projectId?: string }): Promise<{
    phoneNumbers: PhoneNumber[];
    wabas: MetaWabaRecord[];
    metaError?: MetaGraphApiError | null;
  }> {
    const config = getServerConfig(options?.refresh);
    const { getMetaClientForWaba } = await import("../integrations/meta/graphApiClient");
    const client = await getMetaClientForWaba(options?.wabaId);
    const token = config.WHATSAPP_ACCESS_TOKEN || config.ACCESS_TOKEN;

    // 1. Fetch current project assignments from MSSQL
    const assignments = await this.phoneRepo.getProjectAssignments();

    // If credentials are not configured, return preserved cached numbers or empty list with error
    if (!token && !options?.wabaId) {
      let cached = await this.phoneRepo.findAll();
      if (options?.projectId) {
        cached = cached.filter((p) => p.projectId === options.projectId);
      }
      return {
        phoneNumbers: cached,
        wabas: [],
        metaError: new MetaGraphApiError("WHATSAPP_ACCESS_TOKEN is not configured in environment.", {
          code: "META_CREDENTIALS_MISSING",
          status: 401,
        }),
      };
    }

    try {
      // 2. Discover accessible WABAs from Meta
      let wabas = await client.discoverAllWabas({ bypassCache: options?.refresh });

      // Fallback: If no WABAs discovered but WABA ID is configured, add it
      const configuredWabaId = options?.wabaId || config.WHATSAPP_WABA_ID || config.ACCOUNT_ID;
      if (wabas.length === 0 && configuredWabaId) {
        wabas.push({
          id: configuredWabaId,
          name: "WhatsApp Business Account",
        });
      }

      if (options?.wabaId) {
        wabas = wabas.filter((w) => w.id === options.wabaId);
        if (wabas.length === 0) {
          wabas.push({ id: options.wabaId, name: "WhatsApp Business Account" });
        }
      }

      const allFetchedPhoneIds = new Set<string>();
      const enrichedNumbers: PhoneNumber[] = [];

      // 3. For each accessible WABA, fetch its live phone numbers from Meta
      for (const waba of wabas) {
        const metaNumbers = await client.fetchWabaPhoneNumbers(waba.id, {
          bypassCache: options?.refresh,
        });

        for (const metaPhone of metaNumbers) {
          allFetchedPhoneIds.add(metaPhone.id);
          const assignment = assignments.get(metaPhone.id);

          const phoneNumber: PhoneNumber = {
            phoneNumberId: metaPhone.id,
            wabaId: waba.id,
            wabaName: waba.name || "WhatsApp Business Account",
            displayPhoneNumber: metaPhone.display_phone_number || metaPhone.id,
            verifiedName: metaPhone.verified_name || "Unverified Name",
            qualityRating: metaPhone.quality_rating || "UNKNOWN",
            codeVerificationStatus: metaPhone.code_verification_status || metaPhone.name_status || "UNKNOWN",
            messagingLimitTier: metaPhone.messaging_limit_tier || "NOT_REPORTED",
            status: metaPhone.status || "CONNECTED",
            nameStatus: metaPhone.name_status,
            isDefault: assignment?.isDefault ?? false,
            projectId: assignment?.projectId ?? null,
            projectName: assignment?.projectName ?? null,
            isMetaDiscovered: true,
            createdAt: assignment?.updatedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          enrichedNumbers.push(phoneNumber);
        }
      }

      // 4. Preserve existing historical numbers assigned in MSSQL that may not be currently returned by Meta
      for (const [phoneId, assign] of assignments.entries()) {
        if (!allFetchedPhoneIds.has(phoneId)) {
          const cachedNumber = await this.phoneRepo.findById(phoneId);
          enrichedNumbers.push({
            phoneNumberId: phoneId,
            wabaId: cachedNumber?.wabaId || "historical_waba",
            wabaName: cachedNumber?.wabaName || "Historical Account",
            displayPhoneNumber: cachedNumber?.displayPhoneNumber || phoneId,
            verifiedName: cachedNumber?.verifiedName || assign.projectName,
            qualityRating: cachedNumber?.qualityRating || "UNKNOWN",
            codeVerificationStatus: cachedNumber?.codeVerificationStatus || "UNKNOWN",
            messagingLimitTier: cachedNumber?.messagingLimitTier || "NOT_REPORTED",
            status: "OFFLINE_OR_UNAVAILABLE",
            isDefault: assign.isDefault,
            projectId: assign.projectId,
            projectName: assign.projectName,
            isMetaDiscovered: false,
            createdAt: cachedNumber?.createdAt || assign.updatedAt,
            updatedAt: assign.updatedAt,
          });
        }
      }

      // 5. Update local cache in MSSQL without deleting historical data
      await this.phoneRepo.savePhoneNumbersCache(enrichedNumbers);

      const filteredNumbers = options?.projectId
        ? enrichedNumbers.filter((p) => p.projectId === options.projectId)
        : enrichedNumbers;

      return {
        phoneNumbers: filteredNumbers,
        wabas,
        metaError: null,
      };
    } catch (err: any) {
      console.warn("[WhatsAppDataService] Meta Graph API fetch failed:", err.message);

      // In case of Meta error (e.g. token expired), load previously cached records from MSSQL
      // so the app remains resilient and displays historical data with the error status
      const cached = await this.phoneRepo.findAll();
      const metaError =
        err instanceof MetaGraphApiError
          ? err
          : new MetaGraphApiError(err.message || "Failed to communicate with Meta Graph API", {
              code: "META_GRAPH_API_ERROR",
              status: 500,
            });

      return {
        phoneNumbers: cached,
        wabas: [],
        metaError,
      };
    }
  }

  /**
   * Assigns or unassigns a dynamically fetched phone number to an internal project.
   */
  async assignPhoneNumberToProject(
    phoneNumberId: string,
    projectId: string | null,
    isDefault = false
  ): Promise<PhoneNumber> {
    const cleanPhoneId = phoneNumberId.trim();
    if (!cleanPhoneId) {
      throw new Error("phoneNumberId is required");
    }

    if (!projectId) {
      // Unassigning
      await this.phoneRepo.unassignFromProject(cleanPhoneId);
      const phone = (await this.phoneRepo.findById(cleanPhoneId)) || {
        phoneNumberId: cleanPhoneId,
        wabaId: "waba_unknown",
        displayPhoneNumber: cleanPhoneId,
        verifiedName: "WhatsApp Number",
        isDefault: false,
        projectId: null,
        projectName: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return { ...phone, projectId: null, projectName: null };
    }

    // Verify Project exists in MSSQL
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new Error(`Internal Project not found: ${projectId}`);
    }

    // Persist assignment mapping in MSSQL
    await this.phoneRepo.assignToProject(cleanPhoneId, project.projectId, project.name, isDefault);

    // Retrieve full phone number representation
    const phone = await this.phoneRepo.findById(cleanPhoneId);
    if (phone) {
      return {
        ...phone,
        projectId: project.projectId,
        projectName: project.name,
        isDefault,
      };
    }

    return {
      phoneNumberId: cleanPhoneId,
      wabaId: "unknown_waba",
      displayPhoneNumber: cleanPhoneId,
      verifiedName: project.name,
      qualityRating: "UNKNOWN",
      codeVerificationStatus: "UNKNOWN",
      messagingLimitTier: "NOT_REPORTED",
      status: "CONNECTED",
      isDefault,
      projectId: project.projectId,
      projectName: project.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

let serviceInstance: WhatsAppDataService | null = null;
export function getWhatsAppDataService(): WhatsAppDataService {
  if (!serviceInstance) {
    serviceInstance = new WhatsAppDataService();
  }
  return serviceInstance;
}
