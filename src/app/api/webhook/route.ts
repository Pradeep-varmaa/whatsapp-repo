import { GET as metaGet, POST as metaPost } from "@/app/webhooks/whatsapp/meta/route";

// Alias endpoint for standard /api/webhook requests
export const GET = metaGet;
export const POST = metaPost;
