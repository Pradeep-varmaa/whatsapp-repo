import { getMetaGraphApiClient } from "../integrations/meta/graphApiClient";
import { executeQuery, sql } from "../database/connection";
import { Message, PhoneNumber } from "@/shared/types";
import { getServerConfig } from "../config";
import { PhoneNumberRepository } from "../repositories/phoneNumberRepository";
import { ProjectRepository } from "../repositories/projectRepository";
import { logger } from "../security/logger";

export interface SendMessageParams {
  recipientPhone: string;
  projectId?: string;
  phoneNumberId?: string;
  messageType?: "text" | "template" | "image" | "document" | "audio" | "video" | "interactive";
  contentText?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateParameters?: any;
  mediaUrl?: string | null;
  mediaId?: string | null;
  caption?: string | null;
  filename?: string | null;
  interactivePayload?: {
    kind: "buttons" | "list";
    text: string;
    buttons?: Array<{ id: string; title: string }>;
    buttonText?: string;
    sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
  } | null;
  idempotencyKey?: string | null;
  isTestSendOverride?: boolean;
}

const idempotencyStore = new Map<string, Message>();
const customerInboundActivity = new Map<string, number>();

export class MessagingService {
  private client = getMetaGraphApiClient();

  /**
   * Reset in-memory messaging stores (for unit testing)
   */
  static resetStores() {
    idempotencyStore.clear();
    customerInboundActivity.clear();
  }

  /**
   * Record customer inbound activity to open the 24-hour customer care window
   */
  static recordInboundInteraction(phoneNumberId: string, customerPhone: string, timestamp = Date.now()) {
    const cleanPhone = customerPhone.replace(/\D/g, "");
    customerInboundActivity.set(`${phoneNumberId}:${cleanPhone}`, timestamp);
    customerInboundActivity.set(cleanPhone, timestamp);
  }

  /**
   * Check if a customer is inside the active 24-hour customer window
   */
  async isCustomerInside24hWindow(phoneNumberId: string, recipientPhone: string): Promise<boolean> {
    const cleanRecipient = recipientPhone.replace(/\D/g, "");
    const windowStartMs = Date.now() - 24 * 3600 * 1000;
    const windowStartDate = new Date(windowStartMs);

    // 1. In-memory check
    const key = `${phoneNumberId}:${cleanRecipient}`;
    const lastInboundTime = customerInboundActivity.get(key) ?? customerInboundActivity.get(cleanRecipient);
    if (lastInboundTime && lastInboundTime >= windowStartMs) {
      return true;
    }

    // 2. Database query check
    try {
      const rows = await executeQuery<any>(
        `SELECT TOP 1 created_at FROM ENGINE_REQUEST_LOGS
         WHERE direction = 'inbound' AND from_number LIKE '%' + @phone AND created_at >= @windowStart
         ORDER BY created_at DESC`,
        {
          phone: { type: sql.NVarChar(50), value: cleanRecipient },
          windowStart: { type: sql.DateTime2, value: windowStartDate },
        }
      );
      if (rows && rows.length > 0) {
        return true;
      }
    } catch {
      // In-memory fallback
    }

    return false;
  }

  async listMessages(options?: { projectId?: string; status?: string }): Promise<Message[]> {
    let query = `
      SELECT message_id, wamid, idempotency_key, project_id, phone_number_id,
             customer_id, direction, message_type, content_text, template_name,
             template_language, status, error_code, error_message, sent_at,
             delivered_at, read_at, created_at, updated_at
      FROM WA_MESSAGES
      WHERE 1=1
    `;
    const params: Record<string, { type: sql.ISqlType; value: any }> = {};

    if (options?.projectId) {
      query += ` AND project_id = @projectId`;
      params.projectId = { type: sql.NVarChar(64), value: options.projectId };
    }
    if (options?.status) {
      query += ` AND status = @status`;
      params.status = { type: sql.NVarChar(30), value: options.status };
    }
    query += ` ORDER BY created_at DESC`;

    const rows = await executeQuery<any>(query, params);
    if (!rows || rows.length === 0) return [];

    return rows.map((r) => ({
      messageId: r.message_id,
      wamid: r.wamid,
      idempotencyKey: r.idempotency_key,
      projectId: r.project_id,
      phoneNumberId: r.phone_number_id,
      customerId: r.customer_id,
      recipientPhone: r.customer_id ? `+${r.customer_id.replace(/\D/g, "")}` : "",
      direction: r.direction,
      messageType: r.message_type,
      contentText: r.content_text,
      templateName: r.template_name,
      templateLanguage: r.template_language,
      templateParameters: null,
      status: r.status,
      errorCode: r.error_code,
      errorMessage: r.error_message,
      retryCount: 0,
      isMock: false,
      sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
      deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : null,
      readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async sendMessage(params: SendMessageParams): Promise<{ message: Message }> {
    // 0. Honor Idempotency Key
    if (params.idempotencyKey && idempotencyStore.has(params.idempotencyKey)) {
      const cached = idempotencyStore.get(params.idempotencyKey)!;
      return { message: cached };
    }

    // 1. Resolve phone number
    let phoneNumberId = params.phoneNumberId;

    if (!phoneNumberId && params.projectId) {
      try {
        const mapping = await executeQuery<any>(
          `SELECT phone_number_id FROM WA_PROJECT_MAPPINGS WHERE project_id = @projectId AND is_active = 1`,
          { projectId: { type: sql.NVarChar(64), value: params.projectId } }
        );
        phoneNumberId = mapping?.[0]?.phone_number_id;
      } catch {
        // DB fallback
      }
    }

    // If no project-specific mapping exists, check global config
    if (!phoneNumberId) {
      const config = getServerConfig();
      phoneNumberId = config.PHONE_NUMBER_ID;
    }

    if (!phoneNumberId) {
      throw new Error(`No verified WhatsApp Phone Number is mapped or available.`);
    }

    // Recipient phone must be formatted to digits-only
    const cleanRecipient = params.recipientPhone.replace(/\D/g, "");
    if (cleanRecipient.length < 8) {
      throw new Error(`Invalid international phone number '${params.recipientPhone}'.`);
    }

    // 2. Dispatch live via Meta Graph API client
    let sendResult: { wamid: string };
    if (params.messageType === "template" && params.templateName) {
      sendResult = await this.client.sendTemplateMessage({
        phoneNumberId,
        recipientPhone: cleanRecipient,
        templateName: params.templateName,
        languageCode: params.templateLanguage || "en_US",
        components: params.templateParameters,
      });
    } else if (
      params.messageType === "image" ||
      params.messageType === "document" ||
      params.messageType === "audio" ||
      params.messageType === "video"
    ) {
      if (!params.mediaUrl && !params.mediaId) {
        throw new Error(`Media type '${params.messageType}' requires mediaUrl or mediaId.`);
      }
      sendResult = await this.client.sendMediaMessage({
        phoneNumberId,
        recipientPhone: cleanRecipient,
        mediaType: params.messageType,
        mediaUrl: params.mediaUrl || undefined,
        mediaId: params.mediaId || undefined,
        caption: params.caption || undefined,
        filename: params.filename || undefined,
      });
    } else if (params.messageType === "interactive" && params.interactivePayload) {
      if (params.interactivePayload.kind === "list") {
        sendResult = await this.client.sendInteractiveList({
          phoneNumberId,
          recipientPhone: cleanRecipient,
          text: params.interactivePayload.text,
          buttonText: params.interactivePayload.buttonText || "Select Option",
          sections: params.interactivePayload.sections || [],
        });
      } else {
        sendResult = await this.client.sendInteractiveButtons({
          phoneNumberId,
          recipientPhone: cleanRecipient,
          text: params.interactivePayload.text,
          buttons: params.interactivePayload.buttons || [],
        });
      }
    } else {
      if (!params.contentText) {
        throw new Error("Message text cannot be empty.");
      }
      sendResult = await this.client.sendTextMessage({
        phoneNumberId,
        recipientPhone: cleanRecipient,
        text: params.contentText,
      });
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    // Resolve valid projectId if not provided or doesn't exist
    let resolvedProjectId = params.projectId;
    if (!resolvedProjectId || resolvedProjectId === "default") {
      try {
        const pRows = await executeQuery<any>(
          `SELECT TOP 1 project_id FROM ENGINE_PROJECTS ORDER BY created_at ASC`
        );
        resolvedProjectId = pRows?.[0]?.project_id || "default";
      } catch {
        resolvedProjectId = "default";
      }
    }

    const newMessage: Message = {
      messageId,
      wamid: sendResult.wamid,
      idempotencyKey: params.idempotencyKey || null,
      projectId: resolvedProjectId || "default",
      phoneNumberId,
      customerId: `cust_${cleanRecipient}`,
      recipientPhone: `+${cleanRecipient}`,
      direction: "outbound",
      messageType: params.messageType || "text",
      contentText: params.contentText || null,
      templateName: params.templateName || null,
      templateLanguage: params.templateLanguage || null,
      status: "sent",
      retryCount: 0,
      isMock: false,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    };

    if (params.idempotencyKey) {
      idempotencyStore.set(params.idempotencyKey, newMessage);
    }

    // 3. Persist to WA_MESSAGES table
    try {
      await executeQuery(
        `INSERT INTO WA_MESSAGES (message_id, wamid, idempotency_key, project_id, phone_number_id, customer_id, direction, message_type, content_text, template_name, template_language, status, retry_count, is_mock, sent_at, created_at, updated_at)
         VALUES (@id, @wamid, @idem, @proj, @phone, @cust, 'outbound', @type, @content, @tplName, @tplLang, 'sent', 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME())`,
        {
          id: { type: sql.NVarChar(64), value: newMessage.messageId },
          wamid: { type: sql.NVarChar(128), value: newMessage.wamid || null },
          idem: { type: sql.NVarChar(128), value: newMessage.idempotencyKey || null },
          proj: { type: sql.NVarChar(64), value: newMessage.projectId },
          phone: { type: sql.NVarChar(64), value: newMessage.phoneNumberId },
          cust: { type: sql.NVarChar(64), value: newMessage.customerId },
          type: { type: sql.NVarChar(30), value: newMessage.messageType },
          content: { type: sql.NVarChar(sql.MAX), value: newMessage.contentText },
          tplName: { type: sql.NVarChar(150), value: newMessage.templateName },
          tplLang: { type: sql.NVarChar(10), value: newMessage.templateLanguage },
        }
      );
    } catch (dbErr: any) {
      logger.warn("Failed to persist outbound message to WA_MESSAGES:", { error: dbErr?.message });
    }

    return { message: newMessage };
  }

  private async resolveSenderPhoneNumberId(phoneNumberId?: string | null, projectId?: string): Promise<string> {
    let resolved = phoneNumberId;
    if (!resolved && projectId) {
      try {
        const mapping = await executeQuery<any>(
          `SELECT phone_number_id FROM WA_PROJECT_MAPPINGS WHERE project_id = @projectId AND is_active = 1`,
          { projectId: { type: sql.NVarChar(64), value: projectId } }
        );
        resolved = mapping?.[0]?.phone_number_id;
      } catch {
        // DB fallback
      }
    }
    if (!resolved) {
      const config = getServerConfig();
      resolved = config.PHONE_NUMBER_ID;
    }
    if (!resolved) {
      throw new Error("No verified WhatsApp Phone Number is mapped or available.");
    }
    return resolved;
  }

  /**
   * Send interactive button quick replies
   */
  async sendInteractiveButtons(params: {
    projectId: string;
    phoneNumberId?: string | null;
    recipientPhone: string;
    text: string;
    buttons: Array<{ id: string; title: string }>;
  }): Promise<{ message: Message }> {
    const phoneNumberId = await this.resolveSenderPhoneNumberId(params.phoneNumberId, params.projectId);
    if (!phoneNumberId) throw new Error("No verified WhatsApp Phone Number is available.");

    const cleanRecipient = params.recipientPhone.replace(/\D/g, "");
    const sendResult = await this.client.sendInteractiveButtons({
      phoneNumberId,
      recipientPhone: cleanRecipient,
      text: params.text,
      buttons: params.buttons,
    });

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const newMessage: Message = {
      messageId,
      wamid: sendResult.wamid,
      idempotencyKey: null,
      projectId: params.projectId || "default",
      phoneNumberId,
      customerId: `cust_${cleanRecipient}`,
      recipientPhone: `+${cleanRecipient}`,
      direction: "outbound",
      messageType: "interactive",
      contentText: params.text,
      templateName: null,
      templateLanguage: null,
      status: "sent",
      retryCount: 0,
      isMock: false,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await executeQuery(
        `INSERT INTO WA_MESSAGES (message_id, wamid, project_id, phone_number_id, customer_id, direction, message_type, content_text, status, retry_count, is_mock, sent_at, created_at, updated_at)
         VALUES (@id, @wamid, @proj, @phone, @cust, 'outbound', 'interactive', @content, 'sent', 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME())`,
        {
          id: { type: sql.NVarChar(64), value: newMessage.messageId },
          wamid: { type: sql.NVarChar(128), value: newMessage.wamid || null },
          proj: { type: sql.NVarChar(64), value: newMessage.projectId },
          phone: { type: sql.NVarChar(64), value: newMessage.phoneNumberId },
          cust: { type: sql.NVarChar(64), value: newMessage.customerId },
          content: { type: sql.NVarChar(sql.MAX), value: newMessage.contentText },
        }
      );
    } catch (dbErr: any) {
      logger.warn("Failed to persist interactive buttons outbound message:", { error: dbErr?.message });
    }

    return { message: newMessage };
  }

  /**
   * Send interactive list menu
   */
  async sendInteractiveList(params: {
    projectId: string;
    phoneNumberId?: string | null;
    recipientPhone: string;
    text: string;
    buttonText?: string;
    sections: Array<{
      title?: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  }): Promise<{ message: Message }> {
    const phoneNumberId = await this.resolveSenderPhoneNumberId(params.phoneNumberId, params.projectId);
    if (!phoneNumberId) throw new Error("No verified WhatsApp Phone Number is available.");

    const cleanRecipient = params.recipientPhone.replace(/\D/g, "");
    const sendResult = await this.client.sendInteractiveList({
      phoneNumberId,
      recipientPhone: cleanRecipient,
      text: params.text,
      buttonText: params.buttonText,
      sections: params.sections,
    });

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const newMessage: Message = {
      messageId,
      wamid: sendResult.wamid,
      idempotencyKey: null,
      projectId: params.projectId || "default",
      phoneNumberId,
      customerId: `cust_${cleanRecipient}`,
      recipientPhone: `+${cleanRecipient}`,
      direction: "outbound",
      messageType: "interactive",
      contentText: params.text,
      templateName: null,
      templateLanguage: null,
      status: "sent",
      retryCount: 0,
      isMock: false,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await executeQuery(
        `INSERT INTO WA_MESSAGES (message_id, wamid, project_id, phone_number_id, customer_id, direction, message_type, content_text, status, retry_count, is_mock, sent_at, created_at, updated_at)
         VALUES (@id, @wamid, @proj, @phone, @cust, 'outbound', 'interactive', @content, 'sent', 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME())`,
        {
          id: { type: sql.NVarChar(64), value: newMessage.messageId },
          wamid: { type: sql.NVarChar(128), value: newMessage.wamid || null },
          proj: { type: sql.NVarChar(64), value: newMessage.projectId },
          phone: { type: sql.NVarChar(64), value: newMessage.phoneNumberId },
          cust: { type: sql.NVarChar(64), value: newMessage.customerId },
          content: { type: sql.NVarChar(sql.MAX), value: newMessage.contentText },
        }
      );
    } catch (dbErr: any) {
      logger.warn("Failed to persist interactive list outbound message:", { error: dbErr?.message });
    }

    return { message: newMessage };
  }

  /**
   * Step 1: Add a raw phone number to WABA (Meta Graph API: POST /{ACCOUNT_ID}/phone_numbers)
   */
  async addPhoneNumber(params: {
    cc: string;
    phoneNumber: string;
    verifiedName: string;
  }): Promise<{ phoneNumberId: string }> {
    const config = getServerConfig();
    const wabaId = config.WHATSAPP_WABA_ID || config.ACCOUNT_ID;
    if (!wabaId) {
      throw new Error("WABA ID (WHATSAPP_WABA_ID or ACCOUNT_ID) is not configured in server environment.");
    }

    const cleanCc = params.cc.replace(/\D/g, "");
    const cleanPhone = params.phoneNumber.replace(/\D/g, "");
    const cleanName = params.verifiedName.trim();

    logger.info("Adding phone number to Meta WABA", { wabaId, cc: cleanCc });

    const metaRes = await this.client.addPhoneNumberToWaba(wabaId, {
      cc: cleanCc,
      phoneNumber: cleanPhone,
      verifiedName: cleanName,
    });

    const phoneNumberId = metaRes.id;

    // Persist provisional record in database so the onboarding flow is resumable
    try {
      const phoneRepo = new PhoneNumberRepository();
      const provisionalRecord: PhoneNumber = {
        phoneNumberId,
        wabaId,
        wabaName: "WhatsApp Business Account",
        displayPhoneNumber: `+${cleanCc} ${cleanPhone}`,
        verifiedName: cleanName,
        qualityRating: "UNKNOWN",
        codeVerificationStatus: "NOT_VERIFIED",
        messagingLimitTier: "NOT_REPORTED",
        status: "PENDING",
        isDefault: false,
        projectId: null,
        projectName: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await phoneRepo.savePhoneNumbersCache([provisionalRecord]);
    } catch (err: any) {
      logger.warn("Could not persist provisional phone number in repository", { error: err.message });
    }

    return { phoneNumberId };
  }

  /**
   * Step 2: Request verification code via SMS or VOICE (Meta Graph API: POST /{phoneNumberId}/request_code)
   */
  async requestCode(params: {
    phoneNumberId: string;
    method: "SMS" | "VOICE";
    language?: string;
  }): Promise<{ success: boolean }> {
    const cleanPhoneId = params.phoneNumberId.trim();
    const cleanMethod = params.method === "VOICE" ? "VOICE" : "SMS";
    const cleanLang = params.language?.trim() || "en_US";

    logger.info("Requesting phone verification code from Meta", {
      phoneNumberId: cleanPhoneId,
      method: cleanMethod,
    });

    await this.client.requestPhoneNumberCode(cleanPhoneId, {
      method: cleanMethod,
      language: cleanLang,
    });

    return { success: true };
  }

  /**
   * Step 3: Verify the 6-digit code received (Meta Graph API: POST /{phoneNumberId}/verify_code)
   * Note: Verification code is strictly never logged.
   */
  async verifyCode(params: {
    phoneNumberId: string;
    code: string;
  }): Promise<{ success: boolean }> {
    const cleanPhoneId = params.phoneNumberId.trim();
    const cleanCode = params.code.trim();

    logger.info("Verifying phone number code with Meta", {
      phoneNumberId: cleanPhoneId,
    });

    await this.client.verifyPhoneNumberCode(cleanPhoneId, cleanCode);

    // Update code verification status in repository
    try {
      const phoneRepo = new PhoneNumberRepository();
      const existing = await phoneRepo.findById(cleanPhoneId);
      if (existing) {
        existing.codeVerificationStatus = "VERIFIED";
        existing.updatedAt = new Date().toISOString();
        await phoneRepo.savePhoneNumbersCache([existing]);
      }
    } catch (err: any) {
      logger.warn("Could not update verification status in repository", { error: err.message });
    }

    return { success: true };
  }

  /**
   * Step 4: Register phone number with 6-digit PIN and save to project
   * (Meta Graph API: POST /{phoneNumberId}/register, then GET /{phoneNumberId})
   * Note: PIN is strictly never logged or stored.
   */
  async registerPhoneNumber(params: {
    phoneNumberId: string;
    pin: string;
    projectId?: string | null;
    isDefault?: boolean;
  }): Promise<{ success: boolean; phoneNumber: PhoneNumber }> {
    const cleanPhoneId = params.phoneNumberId.trim();
    const cleanPin = params.pin.trim();

    logger.info("Registering phone number with Meta Cloud API", {
      phoneNumberId: cleanPhoneId,
      projectId: params.projectId,
      isDefault: Boolean(params.isDefault),
    });

    // 1. Meta registration
    await this.client.registerPhoneNumber(cleanPhoneId, cleanPin);

    // 2. Query fresh metadata from Meta
    const metaDetails = await this.client.getPhoneNumberDetails(cleanPhoneId);

    const config = getServerConfig();
    const wabaId = config.WHATSAPP_WABA_ID || config.ACCOUNT_ID || "unknown_waba";

    // 3. Persist project assignment if specified
    const phoneRepo = new PhoneNumberRepository();
    const projectRepo = new ProjectRepository();
    let projectName: string | null = null;

    if (params.projectId) {
      const project = await projectRepo.findById(params.projectId);
      projectName = project?.name || "Assigned Project";
      await phoneRepo.assignToProject(cleanPhoneId, params.projectId, projectName, Boolean(params.isDefault));
    }

    const phoneRecord: PhoneNumber = {
      phoneNumberId: cleanPhoneId,
      wabaId,
      wabaName: "WhatsApp Business Account",
      displayPhoneNumber: metaDetails.display_phone_number || cleanPhoneId,
      verifiedName: metaDetails.verified_name || "WhatsApp Sender",
      qualityRating: metaDetails.quality_rating || "GREEN",
      codeVerificationStatus: metaDetails.code_verification_status || "VERIFIED",
      messagingLimitTier: metaDetails.messaging_limit_tier || "NOT_REPORTED",
      status: metaDetails.status || "CONNECTED",
      isDefault: Boolean(params.isDefault),
      projectId: params.projectId || null,
      projectName,
      isMetaDiscovered: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await phoneRepo.savePhoneNumbersCache([phoneRecord]);

    return { success: true, phoneNumber: phoneRecord };
  }
}
