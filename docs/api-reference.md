# API Reference — Centralized WhatsApp Communication Engine

Base URL: `http://localhost:3000/api/v1`

All responses follow a uniform structure:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "correlationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "timestamp": "2026-11-04T12:00:00.000Z"
  }
}
```

---

## 1. System Health

### `GET /api/health`
Returns connection status of MSSQL, Redis, Meta API, and worker processes.

**Response:**
```json
{
  "status": "healthy",
  "engineVersion": "1.0.0",
  "mode": "mock",
  "components": {
    "mssql": { "status": "mock_fallback" },
    "redis": { "status": "mock_fallback" },
    "metaApi": { "status": "unconfigured_mock_mode" },
    "worker": { "status": "active" }
  }
}
```

---

## 2. Projects Management

### `GET /api/v1/projects`
List all internal projects.

### `POST /api/v1/projects`
Create a new internal project.

**Request Body:**
```json
{
  "name": "E-Commerce Checkout Notifications",
  "description": "Order confirmations & OTP updates",
  "callbackUrl": "https://api.merchantstore.com/webhooks/whatsapp",
  "eventTypes": ["message.received", "message.sent", "message.delivered"]
}
```

---

## 3. WhatsApp Messaging

### `GET /api/v1/messages`
Query messages with optional filtering.
- Query params: `projectId`, `status`.

### `POST /api/v1/messages`
Send an outbound WhatsApp message.

**Request Body (Plain Text):**
```json
{
  "projectId": "proj_checkout_notifications",
  "phoneNumberId": "phone_109283746501928",
  "recipientPhone": "+14155552671",
  "messageType": "text",
  "contentText": "Hello, your order #1234 has been confirmed!",
  "idempotencyKey": "order_1234_dispatch"
}
```

**Request Body (Template Message):**
```json
{
  "projectId": "proj_checkout_notifications",
  "phoneNumberId": "phone_109283746501928",
  "recipientPhone": "+14155552671",
  "messageType": "template",
  "templateName": "order_dispatch_notice",
  "templateLanguage": "en_US"
}
```

---

## 4. Phone Numbers

### `GET /api/v1/phone-numbers`
List provisioned phone numbers and quality ratings.

---

## 5. Templates

### `GET /api/v1/templates`
List message templates.

### `POST /api/v1/templates`
Submit a new template for review.

---

## 6. API Keys

### `GET /api/v1/api-keys?projectId={projectId}`
List API keys for a project.

### `POST /api/v1/api-keys`
Generate a new API key. Note: The `rawKey` is only returned once in the response body.

### `DELETE /api/v1/api-keys?keyId={keyId}`
Revoke an API key.

---

## 7. Meta Webhook Ingestion

### `GET /webhooks/whatsapp/meta`
Meta Webhook challenge verification endpoint. Validates `hub.verify_token` against `META_WEBHOOK_VERIFY_TOKEN`.

### `POST /webhooks/whatsapp/meta`
Incoming Meta event receiver. In live mode, validates `X-Hub-Signature-256` HMAC.
