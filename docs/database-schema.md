# Database Schema Documentation — Microsoft SQL Server (MSSQL)

The database layer utilizes parameterized SQL queries and strict relational integrity across 17 core tables.

## 1. Entity Relationship Overview

```text
ENGINE_PROJECTS ──────────┬──────────< ENGINE_API_KEYS
                         │
                         ├──────────< ENGINE_CALLBACK_CONFIG
                         │
                         ├──────────< ENGINE_CALLBACK_DELIVERIES
                         │
                         ├──────────< WA_PROJECT_MAPPINGS >────────── WA_PHONE_NUMBERS
                         │                                                   │
                         ├──────────< WA_CONVERSATIONS >─────────────────────┤
                         │                   │                               │
                         └──────────< WA_MESSAGES >──────────────────────────┘
```

## 2. Table Specifications

### 2.1 Identity, Projects & Security

- **`ENGINE_ROLES`**
  - `role_id` (NVARCHAR(50), PK)
  - `role_name` (NVARCHAR(100), NOT NULL)
  - `description` (NVARCHAR(255))
  - `permissions_json` (NVARCHAR(MAX))
  - `created_at`, `updated_at` (DATETIME2)

- **`ENGINE_USERS`**
  - `user_id` (NVARCHAR(64), PK)
  - `email` (NVARCHAR(255), UNIQUE)
  - `password_hash` (NVARCHAR(255))
  - `full_name` (NVARCHAR(150))
  - `role_id` (FK -> ENGINE_ROLES)
  - `status` (NVARCHAR(30) - 'active', 'suspended', 'invited')

- **`ENGINE_PROJECTS`**
  - `project_id` (NVARCHAR(64), PK)
  - `name` (NVARCHAR(150))
  - `slug` (NVARCHAR(100), UNIQUE)
  - `description` (NVARCHAR(500))
  - `status` (NVARCHAR(30) - 'active', 'inactive', 'archived')
  - `callback_url` (NVARCHAR(500))
  - `event_types_json` (NVARCHAR(MAX))
  - `webhook_signing_secret` (NVARCHAR(255))

- **`ENGINE_PROJECT_MEMBERS`**
  - `membership_id` (NVARCHAR(64), PK)
  - `project_id` (FK -> ENGINE_PROJECTS)
  - `user_id` (FK -> ENGINE_USERS)
  - `project_role` ('owner', 'admin', 'member', 'viewer')

- **`ENGINE_API_KEYS`**
  - `key_id` (NVARCHAR(64), PK)
  - `project_id` (FK -> ENGINE_PROJECTS)
  - `key_name` (NVARCHAR(150))
  - `key_prefix` (NVARCHAR(16))
  - `key_hash` (NVARCHAR(255), indexed)
  - `scopes_json` (NVARCHAR(MAX))
  - `status` ('active', 'revoked', 'expired')
  - `expires_at`, `last_used_at` (DATETIME2)

### 2.2 WhatsApp Business Accounts & Phone Numbers

- **`WA_BUSINESS_ACCOUNTS`**
  - `waba_id` (NVARCHAR(64), PK)
  - `account_name` (NVARCHAR(150))
  - `currency` (NVARCHAR(10))
  - `timezone_id` (NVARCHAR(50))
  - `account_review_status` ('APPROVED', 'PENDING', 'REJECTED')
  - `business_verification_status` ('verified', 'unverified', 'in_review')
  - `health_status` ('HEALTHY', 'WARNING', 'CRITICAL')
  - `is_demo_mode` (BIT)
  - `meta_app_id` (NVARCHAR(64))

- **`WA_ACCOUNT_CREDENTIALS`**
  - `credential_id` (NVARCHAR(64), PK)
  - `waba_id` (FK -> WA_BUSINESS_ACCOUNTS)
  - `encrypted_access_token` (NVARCHAR(MAX) - AES-256-GCM)
  - `token_iv` (NVARCHAR(64))
  - `token_auth_tag` (NVARCHAR(64))
  - `token_type` ('system_user', 'user_access')

- **`WA_PHONE_NUMBERS`**
  - `phone_number_id` (NVARCHAR(64), PK - Meta Phone ID)
  - `waba_id` (FK -> WA_BUSINESS_ACCOUNTS)
  - `display_phone_number` (NVARCHAR(50))
  - `verified_name` (NVARCHAR(150))
  - `quality_rating` ('GREEN', 'YELLOW', 'RED')
  - `code_verification_status` ('VERIFIED', 'NOT_VERIFIED')
  - `messaging_limit_tier` ('TIER_1K', 'TIER_10K', 'TIER_100K', 'UNLIMITED')
  - `status` ('CONNECTED', 'DISCONNECTED', 'FLAGGED')
  - `is_default` (BIT)

- **`WA_PROJECT_MAPPINGS`**
  - `mapping_id` (NVARCHAR(64), PK)
  - `project_id` (FK -> ENGINE_PROJECTS)
  - `waba_id` (FK -> WA_BUSINESS_ACCOUNTS)
  - `phone_number_id` (FK -> WA_PHONE_NUMBERS)
  - `is_active` (BIT)

### 2.3 Customers, Conversations & Messages

- **`WA_CUSTOMERS`**
  - `customer_id` (NVARCHAR(64), PK)
  - `phone_number` (NVARCHAR(50), UNIQUE - E.164)
  - `display_name` (NVARCHAR(150))
  - `opt_in_status` (BIT)

- **`WA_CONVERSATIONS`**
  - `conversation_id` (NVARCHAR(64), PK)
  - `project_id` (FK -> ENGINE_PROJECTS)
  - `phone_number_id` (FK -> WA_PHONE_NUMBERS)
  - `customer_id` (FK -> WA_CUSTOMERS)
  - `meta_conversation_id` (NVARCHAR(128))
  - `status` ('open', 'closed', 'archived')
  - `category` ('service', 'utility', 'marketing', 'authentication')
  - `window_expires_at` (DATETIME2 - 24hr service window)
  - `last_message_at` (DATETIME2)
  - `unread_count` (INT)

- **`WA_MESSAGES`**
  - `message_id` (NVARCHAR(64), PK)
  - `wamid` (NVARCHAR(128), Meta Message ID)
  - `idempotency_key` (NVARCHAR(128), UNIQUE)
  - `project_id` (FK -> ENGINE_PROJECTS)
  - `phone_number_id` (FK -> WA_PHONE_NUMBERS)
  - `customer_id` (FK -> WA_CUSTOMERS)
  - `direction` ('outbound', 'inbound')
  - `message_type` ('text', 'template', 'image', 'document', 'interactive')
  - `content_text` (NVARCHAR(MAX))
  - `template_name`, `template_language` (NVARCHAR)
  - `status` ('queued', 'sending', 'sent', 'delivered', 'read', 'failed')
  - `retry_count` (INT)
  - `is_mock` (BIT)

### 2.4 Webhooks, Callbacks & Audit

- **`WA_WEBHOOK_EVENTS`**: Raw incoming Meta webhooks.
- **`ENGINE_CALLBACK_CONFIG`**: Timeout, retry counts, signing secrets per project.
- **`ENGINE_CALLBACK_DELIVERIES`**: Outbound delivery attempts, status codes, and backoff logs.
- **`ENGINE_IDEMPOTENCY_KEYS`**: Prevents duplicate message dispatches.
- **`ENGINE_AUDIT_LOGS`**: Immutable audit logs of administrative actions.
