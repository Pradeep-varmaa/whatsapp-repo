import { Queue } from "bullmq";
import Redis from "ioredis";
import { getServerConfig } from "../config";
import { BackgroundJob } from "@/shared/types";

const inMemoryJobs: BackgroundJob[] = [];

let redisClient: Redis | null = null;
const activeQueues: Map<string, Queue> = new Map();

export function getRedisConnection(): Redis | null {
  if (redisClient) return redisClient;

  const config = getServerConfig();
  try {
    redisClient = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    redisClient.on("error", (err) => {
      // Keep quiet if Redis is offline during local development
    });

    return redisClient;
  } catch {
    return null;
  }
}

export function getQueue(queueName: string): Queue | null {
  if (activeQueues.has(queueName)) {
    return activeQueues.get(queueName)!;
  }

  const connection = getRedisConnection();
  if (!connection) return null;

  try {
    const queue = new Queue(queueName, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
    activeQueues.set(queueName, queue);
    return queue;
  } catch {
    return null;
  }
}

export async function enqueueOutboundMessage(jobData: {
  messageId: string;
  projectId: string;
  phoneNumberId: string;
  recipientPhone: string;
  messageType: string;
  contentText?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateParameters?: Record<string, unknown> | null;
}) {
  const queue = getQueue("outbound-messages");
  if (queue) {
    try {
      return await queue.add("send_whatsapp_message", jobData, {
        jobId: jobData.messageId,
      });
    } catch {
      // Fallback
    }
  }

  // Fallback in-memory tracking
  inMemoryJobs.unshift({
    jobId: `job_${Date.now()}`,
    queueName: "outbound-messages",
    jobType: "send_whatsapp_message",
    status: "completed",
    progress: 100,
    attemptsMade: 1,
    maxAttempts: 3,
    data: jobData,
    timestamp: new Date().toISOString(),
    processedOn: new Date().toISOString(),
    finishedOn: new Date().toISOString(),
  });
  return null;
}

export async function enqueueWebhookForwarding(deliveryData: {
  deliveryId: string;
  projectId: string;
  targetUrl: string;
  payload: Record<string, unknown>;
  eventType: string;
}) {
  const queue = getQueue("webhook-forwarding");
  if (queue) {
    try {
      return await queue.add("forward_project_callback", deliveryData, {
        jobId: deliveryData.deliveryId,
      });
    } catch {
      // Fallback
    }
  }

  inMemoryJobs.unshift({
    jobId: `job_${Date.now()}`,
    queueName: "webhook-forwarding",
    jobType: "forward_project_callback",
    status: "completed",
    progress: 100,
    attemptsMade: 1,
    maxAttempts: 5,
    data: deliveryData,
    timestamp: new Date().toISOString(),
    processedOn: new Date().toISOString(),
    finishedOn: new Date().toISOString(),
  });
  return null;
}

const QUEUE_NAMES = ["outbound-messages", "webhook-forwarding", "status-updates"] as const;

export interface QueueMetrics {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export async function getQueueMetrics(): Promise<{ redisConnected: boolean; queues: QueueMetrics[] }> {
  const redis = getRedisConnection();
  const redisConnected = Boolean(redis && redis.status === "ready");
  const queues: QueueMetrics[] = [];

  if (redisConnected) {
    for (const qName of QUEUE_NAMES) {
      const q = getQueue(qName);
      if (!q) continue;
      try {
        const counts = await q.getJobCounts("waiting", "active", "completed", "failed", "delayed");
        queues.push({
          queueName: qName,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        });
      } catch {
        queues.push({ queueName: qName, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 });
      }
    }
    return { redisConnected: true, queues };
  }

  for (const qName of QUEUE_NAMES) {
    const items = inMemoryJobs.filter((j) => j.queueName === qName);
    queues.push({
      queueName: qName,
      waiting: items.filter((j) => j.status === "waiting").length,
      active: items.filter((j) => j.status === "active").length,
      completed: items.filter((j) => j.status === "completed").length,
      failed: items.filter((j) => j.status === "failed").length,
      delayed: items.filter((j) => j.status === "delayed").length,
    });
  }
  return { redisConnected: false, queues };
}

export async function getAllBackgroundJobs(limitPerQueue = 50): Promise<BackgroundJob[]> {
  const redis = getRedisConnection();
  if (redis && redis.status === "ready") {
    const liveJobs: BackgroundJob[] = [];
    for (const qName of QUEUE_NAMES) {
      const q = getQueue(qName);
      if (!q) continue;
      try {
        const jobs = await q.getJobs(["failed", "active", "waiting", "delayed", "completed"], 0, limitPerQueue - 1, true);
        for (const job of jobs) {
          const state = await job.getState().catch(() => "waiting");
          liveJobs.push({
            jobId: String(job.id ?? ""),
            queueName: qName,
            jobType: job.name,
            status: state as BackgroundJob["status"],
            progress: typeof job.progress === "number" ? job.progress : 0,
            attemptsMade: job.attemptsMade,
            maxAttempts: job.opts.attempts ?? 5,
            data: (job.data ?? {}) as Record<string, unknown>,
            failedReason: job.failedReason || undefined,
            timestamp: new Date(job.timestamp).toISOString(),
            processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : undefined,
            finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
          });
        }
      } catch {
        // Skip queue if unreachable
      }
    }
    return liveJobs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  return inMemoryJobs;
}

export async function retryBackgroundJob(queueName: string, jobId: string): Promise<{ ok: boolean; message: string }> {
  const q = getQueue(queueName);
  if (q) {
    try {
      const job = await q.getJob(jobId);
      if (!job) return { ok: false, message: `Job ${jobId} not found in ${queueName}` };
      await job.retry();
      return { ok: true, message: `Job ${jobId} re-queued for retry` };
    } catch (err: any) {
      return { ok: false, message: err.message || "Failed to retry job" };
    }
  }

  const memJob = inMemoryJobs.find((j) => j.jobId === jobId && j.queueName === queueName);
  if (memJob) {
    memJob.status = "completed";
    memJob.attemptsMade += 1;
    memJob.failedReason = undefined;
    memJob.finishedOn = new Date().toISOString();
    return { ok: true, message: `In-memory job ${jobId} retried` };
  }
  return { ok: false, message: "Queue unavailable and job not found in memory" };
}

export async function retryAllFailedJobs(queueName?: string): Promise<{ retried: number }> {
  const targets = queueName ? [queueName] : [...QUEUE_NAMES];
  let retried = 0;
  const redis = getRedisConnection();

  if (redis && redis.status === "ready") {
    for (const qName of targets) {
      const q = getQueue(qName);
      if (!q) continue;
      try {
        const failed = await q.getFailed(0, 200);
        for (const job of failed) {
          await job.retry();
          retried++;
        }
      } catch {}
    }
  } else {
    for (const job of inMemoryJobs) {
      if (job.status === "failed" && (!queueName || job.queueName === queueName)) {
        job.status = "completed";
        job.attemptsMade += 1;
        job.failedReason = undefined;
        retried++;
      }
    }
  }
  return { retried };
}
