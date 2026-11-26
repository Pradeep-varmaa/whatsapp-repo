export interface Project {
  projectId: string;
  wabaId?: string | null;
  name: string;
  slug: string;
  description: string | null;
  status: 'active' | 'inactive' | 'archived';
  callbackUrl: string | null;
  eventTypes: string[];
  webhookSigningSecret?: string | null;
  createdAt: string;
  updatedAt: string;
  totalMessages?: number;
  phoneNumbersCount?: number;
}

export interface WhatsAppAccount {
  wabaId: string;
  accountName: string;
  currency: string;
  timezoneId: string;
  messageTemplateNamespace?: string | null;
  accountReviewStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
  businessVerificationStatus: 'verified' | 'unverified' | 'in_review';
  healthStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  isDemoMode: boolean;
  metaAppId?: string | null;
  createdAt: string;
  updatedAt: string;
  connectedProjectId?: string | null;
  connectedProjectName?: string | null;
  phoneNumbersCount?: number;
}

export interface PhoneNumber {
  phoneNumberId: string;
  wabaId: string;
  wabaName?: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating?: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN' | string;
  codeVerificationStatus?: 'VERIFIED' | 'NOT_VERIFIED' | string;
  messagingLimitTier?: 'TIER_1K' | 'TIER_10K' | 'TIER_100K' | 'UNLIMITED' | 'NOT_REPORTED' | string;
  status?: 'CONNECTED' | 'DISCONNECTED' | 'FLAGGED' | 'RESTRICTED' | 'UNVERIFIED' | 'UNKNOWN' | string;
  isDefault: boolean;
  projectId?: string | null;
  projectName?: string | null;
  nameStatus?: string;
  isMetaDiscovered?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  conversationId: string;
  projectId: string;
  projectName?: string;
  phoneNumberId: string;
  senderDisplayNumber?: string;
  customerId: string;
  customerPhone: string;
  customerName?: string;
  metaConversationId?: string | null;
  status: 'open' | 'closed' | 'archived' | 'pending';
  category: 'service' | 'utility' | 'marketing' | 'authentication';
  windowExpiresAt: string | null;
  lastMessageAt: string;
  lastMessageSnippet: string | null;
  lastMessageDirection: 'inbound' | 'outbound';
  unreadCount: number;
}

export interface Message {
  messageId: string;
  wamid?: string | null;
  idempotencyKey?: string | null;
  projectId: string;
  projectName?: string;
  phoneNumberId: string;
  senderNumber?: string;
  customerId: string;
  recipientPhone: string;
  conversationId?: string | null;
  direction: 'outbound' | 'inbound';
  messageType: 'text' | 'template' | 'image' | 'document' | 'audio' | 'video' | 'interactive' | 'location';
  contentText?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateParameters?: Record<string, unknown> | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  errorCode?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  isMock: boolean;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplate {
  templateId: string;
  wabaId: string;
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';
  headerType?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'NONE';
  headerContent?: string | null;
  bodyText: string;
  footerText?: string | null;
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phoneNumber?: string;
    phone_number?: string;
  }>;
  components?: any[];
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEvent {
  eventId: string;
  metaEventId?: string | null;
  eventType: string;
  phoneNumberId?: string | null;
  wabaId?: string | null;
  payload: Record<string, unknown>;
  processingStatus: 'pending' | 'processed' | 'failed' | 'ignored';
  errorMessage?: string | null;
  receivedAt: string;
  processedAt?: string | null;
}

export interface CallbackDelivery {
  deliveryId: string;
  projectId: string;
  projectName?: string;
  eventType: string;
  sourceEventId?: string | null;
  targetUrl: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'sending' | 'delivered' | 'failed' | 'exhausted';
  httpStatusCode?: number | null;
  responseBody?: string | null;
  attemptCount: number;
  nextRetryAt?: string | null;
  lastAttemptAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  phone_number_id: string;
  project_id: string | null;
  allowed_recipients: string[] | null;
  scopes: string[];
  rate_limit_per_minute: number;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_by: string;
  created_at: string;
  raw_key?: string;
}

export type AuditLogEvent =
  | 'key_created'
  | 'key_revoked'
  | 'message_sent'
  | 'auth_failed'
  | 'forbidden'
  | 'validation_failed'
  | 'rate_limited'
  | 'meta_error';

export type AuditLogOutcome = 'success' | 'failure';

export interface AuditLogRecord {
  id: string;
  request_id: string;
  timestamp: string;
  event: AuditLogEvent | string;
  outcome: AuditLogOutcome;
  reason: string | null;
  key_prefix: string | null;
  api_key_id: string | null;
  ip: string | null;
  user_agent: string | null;
  endpoint: string;
  http_status: number;
  recipient_masked: string | null;
  meta_message_id: string | null;
  error_summary: string | null;
}

export interface ApiKeyItem {
  keyId: string;
  projectId: string;
  projectName?: string;
  keyName: string;
  keyPrefix: string;
  scopes: string[];
  status: 'active' | 'revoked' | 'expired';
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
  // Raw key returned only on initial generation
  rawKey?: string;
}

export interface BackgroundJob {
  jobId: string;
  queueName: 'outbound-messages' | 'webhook-forwarding' | 'status-updates' | 'maintenance';
  jobType: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: number;
  attemptsMade: number;
  maxAttempts: number;
  data: Record<string, unknown>;
  lastError?: string | null;
  failedReason?: string;
  timestamp: string;
  processedOn?: string | null;
  finishedOn?: string | null;
}

export interface AuditLogItem {
  logId: string;
  userId?: string | null;
  userEmail?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  status: 'success' | 'failure';
  createdAt: string;
}

export interface RequestLog {
  requestId: string;
  source: 'server' | 'user';
  direction: 'outbound' | 'inbound';
  from: string;
  to: string;
  phoneNumberId?: string | null;
  message: string;
  messageType?: string;
  webhookUrl?: string | null;
  forwardStatus?: 'delivered' | 'failed' | 'not_configured' | 'pending';
  forwardStatusCode?: number | null;
  forwardResponseBody?: any;
  status: 'dispatched' | 'received' | 'failed';
  wamid?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  rawPayload?: any;
  timestamp: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    correlationId?: string;
    timestamp: string;
  };
}
