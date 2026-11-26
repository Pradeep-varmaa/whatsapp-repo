import { Job } from "bullmq";

export async function processStatusUpdate(job: Job): Promise<any> {
  const { wamid, status, timestamp, recipientId } = job.data;
  console.log(`[Worker:Status] Updating message status wamid=${wamid} -> ${status} (${timestamp}) recipient=${recipientId}`);

  // In production, persists into WA_MESSAGES and sends status callback to client project
  return { success: true, updated: true };
}
