import { Conversation } from "@/shared/types";
import { executeQuery, sql } from "../database/connection";

export class ConversationRepository {
  private static inMemory: Conversation[] = [];

  async findAll(projectId?: string): Promise<Conversation[]> {
    try {
      let query = `
        SELECT c.conversation_id, c.project_id, p.name AS project_name, c.phone_number_id,
               ph.display_phone_number AS sender_display_number, c.customer_id,
               cust.phone_number AS customer_phone, cust.display_name AS customer_name,
               c.meta_conversation_id, c.status, c.category, c.window_expires_at,
               c.last_message_at, c.last_message_snippet, c.last_message_direction, c.unread_count
        FROM WA_CONVERSATIONS c
        LEFT JOIN ENGINE_PROJECTS p ON c.project_id = p.project_id
        LEFT JOIN WA_PHONE_NUMBERS ph ON c.phone_number_id = ph.phone_number_id
        LEFT JOIN WA_CUSTOMERS cust ON c.customer_id = cust.customer_id
        WHERE 1=1
      `;
      const params: Record<string, { type: sql.ISqlType; value: any }> = {};

      if (projectId) {
        query += ` AND c.project_id = @projectId`;
        params.projectId = { type: sql.NVarChar(64), value: projectId };
      }
      query += ` ORDER BY c.last_message_at DESC`;

      const rows = await executeQuery<any>(query, params);
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          conversationId: r.conversation_id,
          projectId: r.project_id,
          projectName: r.project_name,
          phoneNumberId: r.phone_number_id,
          senderDisplayNumber: r.sender_display_number,
          customerId: r.customer_id,
          customerPhone: r.customer_phone,
          customerName: r.customer_name,
          metaConversationId: r.meta_conversation_id,
          status: r.status,
          category: r.category,
          windowExpiresAt: r.window_expires_at ? new Date(r.window_expires_at).toISOString() : null,
          lastMessageAt: new Date(r.last_message_at).toISOString(),
          lastMessageSnippet: r.last_message_snippet,
          lastMessageDirection: r.last_message_direction,
          unreadCount: r.unread_count,
        }));
      }
    } catch {
      // Fallback
    }

    if (projectId) {
      return ConversationRepository.inMemory.filter((c) => c.projectId === projectId);
    }
    return ConversationRepository.inMemory;
  }

  async findById(conversationId: string): Promise<Conversation | null> {
    const list = await this.findAll();
    return list.find((c) => c.conversationId === conversationId) || null;
  }
}
