import { WebhookEvent, CallbackDelivery } from "@/shared/types";
import { executeQuery, sql } from "../database/connection";

export class WebhookRepository {
  private static eventsInMemory: WebhookEvent[] = [];
  private static deliveriesInMemory: CallbackDelivery[] = [];

  async findAllEvents(): Promise<WebhookEvent[]> {
    try {
      const rows = await executeQuery<any>(
        `SELECT TOP 100 event_id, meta_event_id, event_type, phone_number_id, waba_id, payload_json, processing_status, error_message, received_at, processed_at
         FROM WA_WEBHOOK_EVENTS
         ORDER BY received_at DESC`
      );

      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          eventId: r.event_id,
          metaEventId: r.meta_event_id,
          eventType: r.event_type,
          phoneNumberId: r.phone_number_id,
          wabaId: r.waba_id,
          payload: typeof r.payload_json === "string" ? JSON.parse(r.payload_json) : r.payload_json,
          processingStatus: r.processing_status,
          errorMessage: r.error_message,
          receivedAt: new Date(r.received_at).toISOString(),
          processedAt: r.processed_at ? new Date(r.processed_at).toISOString() : null,
        }));
      }
    } catch {
      // In-memory fallback
    }

    return WebhookRepository.eventsInMemory;
  }

  async saveEvent(event: WebhookEvent): Promise<WebhookEvent> {
    WebhookRepository.eventsInMemory.unshift(event);

    try {
      await executeQuery(
        `INSERT INTO WA_WEBHOOK_EVENTS (event_id, meta_event_id, event_type, phone_number_id, waba_id, payload_json, processing_status, error_message, received_at, processed_at)
         VALUES (@id, @metaId, @type, @phoneId, @wabaId, @payload, @status, @errMsg, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        {
          id: { type: sql.NVarChar(64), value: event.eventId },
          metaId: { type: sql.NVarChar(128), value: event.metaEventId || null },
          type: { type: sql.NVarChar(100), value: event.eventType },
          phoneId: { type: sql.NVarChar(64), value: event.phoneNumberId || null },
          wabaId: { type: sql.NVarChar(64), value: event.wabaId || null },
          payload: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(event.payload) },
          status: { type: sql.NVarChar(30), value: event.processingStatus },
          errMsg: { type: sql.NVarChar(1000), value: event.errorMessage || null },
        }
      );
    } catch {
      // Handled in-memory fallback
    }

    return event;
  }

  async findAllDeliveries(projectId?: string): Promise<CallbackDelivery[]> {
    if (projectId) {
      return WebhookRepository.deliveriesInMemory.filter((d) => d.projectId === projectId);
    }
    return WebhookRepository.deliveriesInMemory;
  }

  async saveDelivery(delivery: CallbackDelivery): Promise<CallbackDelivery> {
    WebhookRepository.deliveriesInMemory.unshift(delivery);
    return delivery;
  }

  async updateDeliveryStatus(
    deliveryId: string,
    status: CallbackDelivery["status"],
    httpStatusCode?: number,
    responseBody?: string
  ): Promise<void> {
    const idx = WebhookRepository.deliveriesInMemory.findIndex((d) => d.deliveryId === deliveryId);
    if (idx !== -1) {
      WebhookRepository.deliveriesInMemory[idx].status = status;
      WebhookRepository.deliveriesInMemory[idx].attemptCount += 1;
      WebhookRepository.deliveriesInMemory[idx].lastAttemptAt = new Date().toISOString();
      if (httpStatusCode) WebhookRepository.deliveriesInMemory[idx].httpStatusCode = httpStatusCode;
      if (responseBody) WebhookRepository.deliveriesInMemory[idx].responseBody = responseBody;
      if (status === "delivered") {
        WebhookRepository.deliveriesInMemory[idx].deliveredAt = new Date().toISOString();
      }
    }
  }
}
