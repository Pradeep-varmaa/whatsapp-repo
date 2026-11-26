import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/security/guards";
import { PERMISSIONS } from "@/server/security/permissions";
import {
  getAllBackgroundJobs,
  getQueueMetrics,
  retryBackgroundJob,
  retryAllFailedJobs,
} from "@/server/queues/queueManager";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, PERMISSIONS.WHATSAPP_LIVE_VIEW);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const queueFilter = searchParams.get("queue");
  const statusFilter = searchParams.get("status");

  const [metrics, allJobs] = await Promise.all([getQueueMetrics(), getAllBackgroundJobs(50)]);

  let jobs = allJobs;
  if (queueFilter) jobs = jobs.filter((j) => j.queueName === queueFilter);
  if (statusFilter) jobs = jobs.filter((j) => j.status === statusFilter);

  return NextResponse.json({
    success: true,
    redisConnected: metrics.redisConnected,
    queues: metrics.queues,
    jobs,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, PERMISSIONS.WHATSAPP_CONNECTION_MANAGE);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === "retry_job" && body?.queueName && body?.jobId) {
    const result = await retryBackgroundJob(String(body.queueName), String(body.jobId));
    return NextResponse.json({ success: result.ok, message: result.message }, { status: result.ok ? 200 : 404 });
  }

  if (action === "retry_all_failed") {
    const result = await retryAllFailedJobs(body?.queueName ? String(body.queueName) : undefined);
    return NextResponse.json({ success: true, retried: result.retried });
  }

  return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
}
