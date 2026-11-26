import { Message } from "@/shared/types";
import { executeQuery, sql } from "../database/connection";

export class MessageRepository {
  private static inMemory: Message[] = [];

  async findAll(options?: { projectId?: string; status?: string; limit?: number }): Promise<Message[]> {
    try {
      let query = `
        SELECT m.message_id, m.wamid, m.idempotency_key, m.project_id, p.name AS project_name,
               m.phone_number_id, ph.display_phone_number AS sender_number, m.customer_id,
               c.phone_number AS recipient_phone, m.conversation_id, m.direction, m.message_type,
               m.content_text, m.template_name, m.template_language, m.template_parameters_json,
               m.media_url, m.media_mime_type, m.status, m.error_code, m.error_message,
               m.retry_count, m.is_mock, m.sent_at, m.delivered_at, m.read_at, m.created_at, m.updated_at
        FROM WA_MESSAGES m
        LEFT JOIN ENGINE_PROJECTS p ON m.project_id = p.project_id
        LEFT JOIN WA_PHONE_NUMBERS ph ON m.phone_number_id = ph.phone_number_id
        LEFT JOIN WA_CUSTOMERS c ON m.customer_id = c.customer_id
        WHERE 1=1
      `;
      const params: Record<string, { type: sql.ISqlType; value: any }> = {};

      if (options?.projectId) {
        query += ` AND m.project_id = @projectId`;
        params.projectId = { type: sql.NVarChar(64), value: options.projectId };
      }
      if (options?.status) {
        query += ` AND m.status = @status`;
        params.status = { type: sql.NVarChar(30), value: options.status };
      }

      query += ` ORDER BY m.created_at DESC`;

      const rows = await executeQuery<any>(query, params);
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          messageId: r.message_id,
          wamid: r.wamid,
          idempotencyKey: r.idempotency_key,
          projectId: r.project_id,
          projectName: r.project_name,
          phoneNumberId: r.phone_number_id,
          senderNumber: r.sender_number,
          customerId: r.customer_id,
          recipientPhone: r.recipient_phone,
          conversationId: r.conversation_id,
          direction: r.direction,
          messageType: r.message_type,
          contentText: r.content_text,
          templateName: r.template_name,
          templateLanguage: r.template_language,
          templateParameters: r.template_parameters_json ? JSON.parse(r.template_parameters_json) : null,
          mediaUrl: r.media_url,
          mediaMimeType: r.media_mime_type,
          status: r.status,
          errorCode: r.error_code,
          errorMessage: r.error_message,
          retryCount: r.retry_count,
          isMock: Boolean(r.is_mock),
          sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
          deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : null,
          readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        }));
      }
    } catch {
      // Fallback
    }

    let result = [...MessageRepository.inMemory];
    if (options?.projectId) {
      result = result.filter((m) => m.projectId === options.projectId);
    }
    if (options?.status) {
      result = result.filter((m) => m.status === options.status);
    }
    return result;
  }

  async findById(messageId: string): Promise<Message | null> {
    const list = await this.findAll();
    return list.find((m) => m.messageId === messageId) || null;
  }

  async findByIdempotencyKey(key: string): Promise<Message | null> {
    return MessageRepository.inMemory.find((m) => m.idempotencyKey === key) || null;
  }

  async create(message: Message): Promise<Message> {
    try {
      await executeQuery(
        `INSERT INTO WA_MESSAGES (
          message_id, wamid, idempotency_key, project_id, phone_number_id, customer_id,
          conversation_id, direction, message_type, content_text, template_name,
          template_language, status, retry_count, is_mock, created_at, updated_at
        ) VALUES (
          @id, @wamid, @idem, @proj, @phone, @cust, @conv, @dir, @type, @content,
          @tplName, @tplLang, @status, @retry, @isMock, SYSUTCDATETIME(), SYSUTCDATETIME()
        )`,
        {
          id: { type: sql.NVarChar(64), value: message.messageId },
          wamid: { type: sql.NVarChar(128), value: message.wamid || null },
          idem: { type: sql.NVarChar(128), value: message.idempotencyKey || null },
          proj: { type: sql.NVarChar(64), value: message.projectId },
          phone: { type: sql.NVarChar(64), value: message.phoneNumberId },
          cust: { type: sql.NVarChar(64), value: message.customerId },
          conv: { type: sql.NVarChar(64), value: message.conversationId || null },
          dir: { type: sql.NVarChar(10), value: message.direction },
          type: { type: sql.NVarChar(30), value: message.messageType },
          content: { type: sql.NVarChar(sql.MAX), value: message.contentText || null },
          tplName: { type: sql.NVarChar(150), value: message.templateName || null },
          tplLang: { type: sql.NVarChar(10), value: message.templateLanguage || null },
          status: { type: sql.NVarChar(30), value: message.status },
          retry: { type: sql.Int, value: message.retryCount },
          isMock: { type: sql.Bit, value: message.isMock ? 1 : 0 },
        }
      );
    } catch {
      // Fallback
    }

    MessageRepository.inMemory.unshift(message);
    return message;
  }

  async updateStatus(
    messageId: string,
    status: Message["status"],
    extra?: { wamid?: string; errorCode?: string; errorMessage?: string }
  ): Promise<void> {
    const idx = MessageRepository.inMemory.findIndex((m) => m.messageId === messageId);
    if (idx !== -1) {
      MessageRepository.inMemory[idx].status = status;
      MessageRepository.inMemory[idx].updatedAt = new Date().toISOString();
      if (extra?.wamid) MessageRepository.inMemory[idx].wamid = extra.wamid;
      if (extra?.errorCode) MessageRepository.inMemory[idx].errorCode = extra.errorCode;
      if (extra?.errorMessage) MessageRepository.inMemory[idx].errorMessage = extra.errorMessage;
      if (status === "sent") MessageRepository.inMemory[idx].sentAt = new Date().toISOString();
      if (status === "delivered") MessageRepository.inMemory[idx].deliveredAt = new Date().toISOString();
      if (status === "read") MessageRepository.inMemory[idx].readAt = new Date().toISOString();
    }
  }
}
