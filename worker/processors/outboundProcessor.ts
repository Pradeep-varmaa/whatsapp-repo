import { Job } from "bullmq";
import { getMetaGraphApiClient } from "../../src/server/integrations/meta/graphApiClient";
import { logger } from "../../src/server/security/logger";

export async function processOutboundMessage(job: Job): Promise<any> {
  const { messageId, phoneNumberId, recipientPhone, messageType, contentText, templateName, templateLanguage } = job.data;
  logger.info(`[Worker:Outbound] Processing job ${job.id} for message ${messageId}`);

  const client = getMetaGraphApiClient();

  if (messageType === "template") {
    const res = await client.sendTemplateMessage({
      phoneNumberId,
      recipientPhone,
      templateName,
      languageCode: templateLanguage || "en_US",
    });
    return { success: true, wamid: res.wamid };
  } else {
    const res = await client.sendTextMessage({
      phoneNumberId,
      recipientPhone,
      text: contentText || "",
    });
    return { success: true, wamid: res.wamid };
  }
}
