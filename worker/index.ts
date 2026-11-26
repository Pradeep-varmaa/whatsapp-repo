import { Worker } from "bullmq";
import Redis from "ioredis";
import { workerConfig } from "./config";
import { processOutboundMessage } from "./processors/outboundProcessor";
import { processWebhookForwarding } from "./processors/webhookForwarder";
import { processStatusUpdate } from "./processors/statusProcessor";

console.log("=================================================");
console.log("🚀 WHATSAPP COMMUNICATION ENGINE - BACKGROUND WORKER");
console.log(`Connecting to Redis at ${workerConfig.redisHost}:${workerConfig.redisPort}...`);
console.log("=================================================");

const connection = new Redis({
  host: workerConfig.redisHost,
  port: workerConfig.redisPort,
  password: workerConfig.redisPassword,
  maxRetriesPerRequest: null,
});

connection.on("connect", () => {
  console.log("✅ Worker connected to Redis successfully.");
});

connection.on("error", (err) => {
  console.error("❌ Redis connection error in worker:", err.message);
});

// Outbound message queue worker
const outboundWorker = new Worker(
  "outbound-messages",
  async (job) => {
    return await processOutboundMessage(job);
  },
  {
    connection,
    concurrency: workerConfig.concurrency,
  }
);

// Webhook forwarding queue worker
const webhookWorker = new Worker(
  "webhook-forwarding",
  async (job) => {
    return await processWebhookForwarding(job);
  },
  {
    connection,
    concurrency: workerConfig.concurrency,
  }
);

// Status updates queue worker
const statusWorker = new Worker(
  "status-updates",
  async (job) => {
    return await processStatusUpdate(job);
  },
  {
    connection,
    concurrency: workerConfig.concurrency,
  }
);

// Event listeners
[outboundWorker, webhookWorker, statusWorker].forEach((w) => {
  w.on("completed", (job) => {
    console.log(`[Queue:${w.name}] Job ${job.id} COMPLETED.`);
  });

  w.on("failed", (job, err) => {
    console.error(`[Queue:${w.name}] Job ${job?.id} FAILED (Attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`);
  });
});

console.log("📡 Queues active: [outbound-messages, webhook-forwarding, status-updates]");

// Publish worker heartbeat for /api/health liveness checks
const publishHeartbeat = () => {
  connection.set("engine:worker:heartbeat", new Date().toISOString(), "EX", 25).catch(() => {});
};
publishHeartbeat();
const heartbeatTimer = setInterval(publishHeartbeat, 10_000);

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Shutting down workers gracefully...`);
  clearInterval(heartbeatTimer);
  await connection.del("engine:worker:heartbeat").catch(() => {});
  await Promise.all([
    outboundWorker.close(),
    webhookWorker.close(),
    statusWorker.close(),
  ]);
  await connection.quit();
  console.log("👋 All workers stopped. Exit.");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
