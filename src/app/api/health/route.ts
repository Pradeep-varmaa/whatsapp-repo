import { NextResponse } from "next/server";
import { getServerConfig } from "@/server/config";
import { getDbPool } from "@/server/database/connection";
import { getRedisConnection } from "@/server/queues/queueManager";

export async function GET() {
  const config = getServerConfig();
  const pool = await getDbPool();
  const redis = getRedisConnection();

  const isDbHealthy = pool !== null && pool.connected;
  let isRedisHealthy = false;
  let workerHeartbeat = "unknown";

  if (redis) {
    try {
      if (redis.status === "ready") {
        const pong = await redis.ping();
        isRedisHealthy = pong === "PONG";
      }
      if (isRedisHealthy) {
        const hb = await redis.get("engine:worker:heartbeat").catch(() => null);
        workerHeartbeat = hb ? "active" : "standby";
      }
    } catch {
      isRedisHealthy = false;
    }
  }

  const overallHealthy = isDbHealthy && isRedisHealthy;
  const statusCode = overallHealthy ? 200 : 503;

  return NextResponse.json(
    {
      status: overallHealthy ? "healthy" : "degraded",
      engineVersion: "1.0.0",
      mode: config.APP_MODE,
      timestamp: new Date().toISOString(),
      components: {
        mssql: {
          status: isDbHealthy ? "connected" : "disconnected",
        },
        redis: {
          status: isRedisHealthy ? "connected" : "disconnected",
        },
        metaApi: {
          status: config.WHATSAPP_ACCESS_TOKEN || config.ACCESS_TOKEN ? "configured" : "unconfigured",
          wabaId: config.WHATSAPP_WABA_ID || config.ACCOUNT_ID ? "configured" : "unconfigured",
          apiVersion: config.META_GRAPH_API_VERSION,
        },
        worker: {
          status: isRedisHealthy ? workerHeartbeat : "unavailable",
          queues: ["outbound-messages", "webhook-forwarding", "status-updates"],
        },
      },
    },
    { status: statusCode }
  );
}
