# Architecture Split Blueprint: WhatsApp Studio (Control Plane) & Runner / Viewer (Execution Plane)

This document defines the target split of **Dynamic Route (WA Engine)** from a single monolithic Next.js + BullMQ codebase into two decoupled systems:

1. **WhatsApp Studio (Control Plane)** — Meta API configuration, WABA/phone/token management, API key management, drag-and-drop workflow authoring, versioning, and deployment.
2. **Runner / Viewer (Execution Plane)** — Webhook ingestion, reply matching, `FlowRunner` / `ReplyTriggerMatcher` execution, BullMQ background workers, immutable flow package import/activation, and read-only execution log viewing.

---

## 1. Current State Inventory

All paths below reflect the current repository at `c:\Users\ppvar\Desktop\engine\engine`.

### 1.1 Top-Level & Source Folder Map

| Path | Current Responsibility |
| :--- | :--- |
| `src/app/(dashboard)/` | Authenticated UI pages (overview, phone numbers, templates, workflows, webhooks, API keys, audit logs, projects, background jobs, conversations, campaigns, demo, setup guide). |
| `src/app/login/` | Login UI (`page.tsx`, `login.module.css`). |
| `src/app/api/` | Internal dashboard APIs, `/api/v1/*` public messaging/management APIs, `/api/workflows/*`, `/api/cron/token-check`, `/api/health`, `/api/webhook` alias. |
| `src/app/v1/api/` | Legacy message endpoints (`message/route.ts`, `messages/route.ts`) alongside `next.config.ts` rewrites. |
| `src/app/webhooks/whatsapp/meta/` | Inbound Meta Cloud API webhook verification (`GET`) and event ingestion (`POST`). |
| `src/components/workflow/` & `src/components/workflows/` | Two parallel React Flow (`@xyflow/react`) canvas + inspector + node palette implementations. |
| `src/server/config/` | Zod-validated environment loader (`index.ts`) reading `.env.local` and `process.env`. |
| `src/server/database/` | `mssql` connection pool (`connection.ts`), transaction helper (`transaction.ts`), and 11 SQL migration files (`001`–`010`). |
| `src/server/engine/` | Legacy step-array workflow runner (`runner.ts`, `registry.ts`, `triggerMatcher.ts`) backed by `ENGINE_FLOWS` / `ENGINE_FLOW_RUNS`. |
| `src/server/workflows/` | Graph-based workflow engine (`flowRunner.ts`, `triggerMatcher.ts`, `validation.ts`, `crossFlowValidation.ts`, `clone.ts`, `generate.ts`, `starterTemplates.ts`, `variableInterpolator.ts`, `dateUtils.ts`, `types.ts`) backed by `workflows` / `workflow_runs`. |
| `src/server/integrations/meta/` | `MetaGraphApiClient` (`graphApiClient.ts`) for Meta Graph API `v25.0` calls and error mapping. |
| `src/server/queues/` | BullMQ queue producer, Redis connection, and queue inspection/retry (`queueManager.ts`). |
| `src/server/repositories/` | 11 parameterized `mssql` repositories (many with in-memory fallbacks). |
| `src/server/security/` | Crypto (`crypto.ts`), auth guards (`guards.ts`), RBAC (`permissions.ts`), rate limiting (`rateLimiter.ts`), SSRF allowlist (`webhookAllowlist.ts`), logger (`logger.ts`). |
| `src/server/services/` | `messagingService.ts`, `projectService.ts`, `webhookDispatcher.ts`, `auditService.ts`, `whatsappDataService.ts`. |
| `src/shared/` | Shared types (`types/index.ts`), schemas (`schemas/index.ts`), constants (`constants/index.ts`), phone utils (`utils/phone.ts`). |
| `worker/` | Standalone Node.js BullMQ worker (`worker/index.ts`, `worker/config/index.ts`, `processors/outboundProcessor.ts`, `processors/statusProcessor.ts`, `processors/webhookForwarder.ts`). |

### 1.2 Database Tables (Migrations `001`–`010`)

From `src/server/database/migrations/*.sql`:

- `001_engine_auth_and_projects.sql`: `ENGINE_ROLES`, `ENGINE_USERS`, `ENGINE_PROJECTS`, `ENGINE_PROJECT_MEMBERS`, `ENGINE_API_KEYS`
- `002_whatsapp_accounts_and_numbers.sql`: `WA_BUSINESS_ACCOUNTS`, `WA_ACCOUNT_CREDENTIALS`, `WA_PHONE_NUMBERS`, `WA_PROJECT_MAPPINGS`
- `003_messaging_and_conversations.sql`: `WA_CUSTOMERS`, `WA_CONVERSATIONS`, `WA_MESSAGES`
- `004_webhooks_callbacks_and_audit.sql`: `WA_WEBHOOK_EVENTS`, `ENGINE_CALLBACK_CONFIG`, `ENGINE_CALLBACK_DELIVERIES`, `ENGINE_IDEMPOTENCY_KEYS`, `ENGINE_AUDIT_LOGS`
- `005_dynamic_request_logs.sql`: `ENGINE_REQUEST_LOGS`
- `006_workflow_engine_and_rbac.sql`: `ENGINE_WEBHOOK_ALLOWLIST`, `ENGINE_SAVED_ACTIONS`, `ENGINE_FLOWS`, `ENGINE_FLOW_VERSIONS`, `ENGINE_FLOW_RUNS`, `ENGINE_RUN_STEPS`, `ENGINE_REPLY_TRIGGERS`, `ENGINE_RUN_APPROVALS`
- `007_api_keys_and_audit_logs.sql`: `api_keys`, `audit_logs`
- `008_workflow_builder.sql`: `workflows`, `workflow_runs`, `workflow_audit_log`, `webhook_allowlist`
- `009_multi_account_and_project_scoping.sql`: `USER_WA_ACCOUNTS`
- `010_restore_constraints_and_campaigns.sql`: `campaigns`, `campaign_recipients`

---

## 2. Classification Matrix (Studio vs. Runner vs. Shared)

### 2.1 Dashboard Pages (`src/app/`)

| Existing Page | Target | One-Line Reason |
| :--- | :--- | :--- |
| `src/app/login/page.tsx` | **Shared** | Both Studio and Runner require authenticated user sessions (Studio for authoring/config, Runner for viewing/ops). |
| `src/app/(dashboard)/overview/page.tsx` | **Shared (Split)** | Studio shows WABA/project/deployment health; Runner shows execution throughput, queue depth, and delivery rates. |
| `src/app/(dashboard)/projects/page.tsx` | **Studio** | Manages projects and callback URLs (control-plane configuration). |
| `src/app/(dashboard)/phone-numbers/page.tsx` | **Studio** | Registers, verifies, and manages Meta phone numbers and project mappings. |
| `src/app/(dashboard)/templates/page.tsx` | **Studio** | Creates and syncs Meta message templates. |
| `src/app/(dashboard)/subscribed-apps/page.tsx` | **Studio** | Manages WABA app subscriptions on Meta. |
| `src/app/(dashboard)/api-keys/page.tsx` | **Studio** | Generates, edits, rotates, and revokes `wae_live_*` API keys. |
| `src/app/(dashboard)/webhook-allowlist/page.tsx` | **Studio** | Manages approved outbound API/webhook hostnames per project. |
| `src/app/(dashboard)/workflow/page.tsx` & `workflow/[id]/page.tsx` | **Studio** | Legacy drag-and-drop workflow builder (authoring belongs strictly to Studio). |
| `src/app/(dashboard)/workflows/page.tsx` & `workflows/[id]/page.tsx` | **Studio** | Primary drag-and-drop workflow builder, Groq generation, and deployment trigger. |
| `src/app/(dashboard)/workflow/[id]/runs/page.tsx` & `workflows/[id]/runs/page.tsx` | **Runner** | Read-only run logs, node-by-node step timelines, and context variable viewer. |
| `src/app/(dashboard)/webhooks/page.tsx` | **Runner** | Inspects inbound Meta webhook events and outbound forwarding deliveries. |
| `src/app/(dashboard)/background-jobs/page.tsx` | **Runner** | Monitors BullMQ queues (`outbound-messages`, `webhook-forwarding`, `status-updates`) and retries DLQ jobs. |
| `src/app/(dashboard)/conversations/page.tsx` | **Runner** | Views live inbound/outbound message threads and 24-hour customer care windows. |
| `src/app/(dashboard)/campaigns/page.tsx` | **Runner** (or Studio-triggered -> Runner-executed) | Dispatches and tracks bulk outbound template queues via BullMQ. |
| `src/app/(dashboard)/audit-logs/page.tsx` | **Shared** | Both systems emit and inspect their own security/operational audit trails. |
| `src/app/(dashboard)/demo/page.tsx` | **Studio** (Testing) / **Runner** (Webhook Sim) | Message API tester belongs in Studio; inbound webhook simulator targets Runner. |
| `src/app/(dashboard)/setup-guide/page.tsx` | **Studio** | Onboarding guide for Meta Cloud API credentials and webhook setup. |

### 2.2 API Routes (`src/app/api/`, `src/app/v1/`, `src/app/webhooks/`)

| Existing Route | Target | One-Line Reason |
| :--- | :--- | :--- |
| `src/app/api/auth/*` (`login`, `logout`, `me`, `switch-context`) | **Shared** | Session/JWT lifecycle for both apps (with Runner optionally delegating SSO/JWT validation to Studio). |
| `src/app/api/health/route.ts` | **Shared** | Each plane exposes its own liveness/readiness endpoint (`Studio`: DB + Meta; `Runner`: DB + Redis + Worker). |
| `src/app/api/projects/route.ts`, `src/app/api/v1/projects/route.ts` | **Studio** | Project CRUD and callback configuration. |
| `src/app/api/phone-numbers/*`, `src/app/api/v1/phone-numbers/route.ts`, `src/app/api/v1/meta/phone-numbers/route.ts` | **Studio** | Phone number onboarding, OTP verification, and Meta sync. |
| `src/app/api/templates/route.ts`, `src/app/api/v1/templates/route.ts`, `src/app/api/v1/meta/templates/route.ts` | **Studio** | Template creation and Meta template sync. |
| `src/app/api/subscribed-apps/route.ts` | **Studio** | Meta WABA app subscription management. |
| `src/app/api/v1/waba-accounts/*` | **Studio** | Multi-WABA account management and credential storage. |
| `src/app/api/v1/meta/token-health/route.ts`, `src/app/api/cron/token-check/route.ts` | **Studio** | Monitors Meta access token validity and alerts on expiry. |
| `src/app/api/api-keys/*`, `src/app/api/v1/api-keys/route.ts` | **Studio** | Creates, edits, rotates, and revokes API keys. |
| `src/app/api/webhook-allowlist/route.ts`, `src/app/api/v1/webhook-allowlist/route.ts` | **Studio** | Configures allowed outbound hosts (synced into deployed flow packages / Runner config). |
| `src/app/api/workflows/route.ts`, `[id]/route.ts`, `[id]/clone/route.ts`, `[id]/publish/route.ts`, `[id]/restore/route.ts`, `generate/route.ts`, `test-api/route.ts` | **Studio** | Authoring, Groq generation, cloning, version restore, and publishing/deploying flows. |
| `src/app/api/workflows/[id]/runs/route.ts` | **Runner** | Serves flow run history and `workflow_audit_log` step traces. |
| `src/app/webhooks/whatsapp/meta/route.ts`, `src/app/api/webhook/route.ts` | **Runner** | Receives signed Meta webhooks (`X-Hub-Signature-256`), records inbound events, and triggers flow execution. |
| `src/app/api/v1/messages/route.ts`, `src/app/v1/api/message*/route.ts` | **Runner** | High-throughput outbound message execution API (validates API key/quota and dispatches via Meta/BullMQ). |
| `src/app/api/v1/webhooks/route.ts`, `src/app/api/v1/requests/route.ts` | **Runner** | Queries webhook delivery attempts and inbound/outbound request logs. |
| `src/app/api/background-jobs/route.ts` | **Runner** | Reads BullMQ queue metrics and retries failed/DLQ jobs. |
| `src/app/api/conversations/route.ts` | **Runner** | Reads `WA_MESSAGES` threads and 24-hour customer window state. |
| `src/app/api/campaigns/route.ts` | **Runner** | Enqueues and tracks bulk campaign dispatches in BullMQ. |
| `src/app/api/demo/simulate-webhook/route.ts` | **Runner** | Simulates inbound webhook payloads against deployed flows. |
| `src/app/api/audit-logs/*`, `src/app/api/v1/audit-logs/*` | **Shared** | Reads audit logs scoped to the respective plane. |

### 2.3 Server Services, Engines, Repositories & Workers

| Module | Target | One-Line Reason |
| :--- | :--- | :--- |
| `src/server/workflows/types.ts`, `validation.ts`, `crossFlowValidation.ts` | **Shared (`packages/flow-contract`)** | Both Studio (before deploy) and Runner (on push/import) must run identical graph validation. |
| `src/server/workflows/generate.ts`, `clone.ts`, `starterTemplates.ts` | **Studio** | Used only when authoring, cloning, or Groq-generating drafts. |
| `src/server/workflows/flowRunner.ts`, `triggerMatcher.ts`, `variableInterpolator.ts`, `dateUtils.ts` | **Runner** | Executes deployed flow graphs, matches replies, interpolates variables, and parses dates/times. |
| `src/server/engine/*` (`runner.ts`, `registry.ts`, `triggerMatcher.ts`) | **Runner** (legacy) | Legacy step-array execution engine; deprecate or keep Runner-only until retired. |
| `src/server/integrations/meta/graphApiClient.ts` | **Shared** | Studio uses it for WABA/phone/template/token management; Runner uses it for sending messages. |
| `src/server/services/messagingService.ts`, `webhookDispatcher.ts` | **Runner** | Dispatches WhatsApp messages, enforces 24h window, and forwards webhooks to project callbacks. |
| `src/server/services/projectService.ts`, `whatsappDataService.ts` | **Studio** | Manages project config and fetches live WABA/phone/template metadata. |
| `src/server/services/auditService.ts` | **Shared** | Writes structured security/operational audit records in each plane. |
| `src/server/queues/queueManager.ts` & `worker/*` | **Runner** | Redis/BullMQ is strictly Runner-only. |
| `src/server/security/crypto.ts`, `guards.ts`, `permissions.ts`, `logger.ts` | **Shared** | Shared cryptographic primitives, JWT/API-key verification, RBAC, and secret-redacting logger. |
| `src/server/security/rateLimiter.ts`, `webhookAllowlist.ts` | **Runner** (Allowlist managed in **Studio**) | Rate limiting & outbound SSRF checks run at execution time in Runner; allowlist entries are authored in Studio. |
| `src/server/repositories/accountRepository.ts`, `userRepository.ts`, `projectRepository.ts`, `phoneNumberRepository.ts`, `templateRepository.ts`, `apiKeyRepository.ts` | **Studio** | Owns control-plane entities (Runner reads only sanitized runtime projections/snapshots). |
| `src/server/repositories/messageRepository.ts`, `conversationRepository.ts`, `webhookRepository.ts`, `requestLogRepository.ts` | **Runner** | Owns runtime messaging, conversation state, and webhook delivery logs. |
| `src/server/repositories/auditLogRepository.ts` | **Shared** | Writes/queries audit logs per plane. |

---

## 3. Target Folder Structure

Recommended structure is a **two-app workspace + shared contract package** (can live in one repo as an npm/pnpm workspace, or run as two Next.js apps + one worker process):

```text
engine-workspace/
├── packages/
│   └── flow-contract/                # Shared between Studio & Runner (zero DB/Redis deps)
│       ├── src/
│       │   ├── types.ts              # WorkflowGraph, FlowPackage, DeploymentStatus, NodeType
│       │   ├── validation.ts         # Zod schemas + validateGraph() + validateCrossFlows()
│       │   ├── packageCrypto.ts      # Canonical JSON serialization, SHA-256 hash, HMAC/Ed25519 sign & verify
│       │   ├── permissions.ts        # Role & Permission matrix (user, admin, superadmin)
│       │   └── phone.ts              # E.164 normalization & validation
│       └── package.json
│
├── apps/
│   ├── studio/                       # Control Plane (Next.js App Router)
│   │   ├── src/app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (studio)/
│   │   │   │   ├── overview/
│   │   │   │   ├── accounts/         # Multi-WABA & Meta credentials
│   │   │   │   ├── phone-numbers/
│   │   │   │   ├── templates/
│   │   │   │   ├── subscribed-apps/
│   │   │   │   ├── projects/
│   │   │   │   ├── api-keys/
│   │   │   │   ├── webhook-allowlist/
│   │   │   │   ├── workflows/        # Drag-and-drop builder, Groq generator, Deploy UI
│   │   │   │   ├── deployments/      # Target Runners, deployment history & rollback
│   │   │   │   └── audit-logs/
│   │   │   └── api/
│   │   │       ├── auth/
│   │   │       ├── meta/             # WABA, phone numbers, templates, token health
│   │   │       ├── projects/
│   │   │       ├── api-keys/
│   │   │       ├── webhook-allowlist/
│   │   │       ├── workflows/        # Drafts, versions, generate, clone, deploy -> push to Runner
│   │   │       └── deployments/      # Status callback receiver from Runner
│   │   └── src/server/               # Studio DB connection (studio.*), Meta client, Studio repos
│   │
│   ├── runner/                       # Execution Plane + Read-Only Viewer (Next.js App Router)
│   │   ├── src/app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (viewer)/
│   │   │   │   ├── flows/            # Read-only list & viewer, JSON package import, enable/disable/pause/delete
│   │   │   │   ├── runs/             # Run logs, node-by-node steps, failures, context inspector
│   │   │   │   ├── webhooks/         # Inbound events & callback delivery logs
│   │   │   │   ├── background-jobs/  # BullMQ queues & DLQ retry
│   │   │   │   ├── messages/         # Message delivery status logs
│   │   │   │   └── demo/             # Inbound webhook simulator
│   │   │   ├── webhooks/whatsapp/meta/ # Inbound Meta webhook receiver
│   │   │   └── api/
│   │   │       ├── v1/messages/      # Outbound messaging execution API
│   │   │       ├── internal/deploy/  # Receives signed FlowPackage push from Studio
│   │   │       ├── flows/            # Import JSON package, enable/disable/pause/delete (NO edit)
│   │   │       ├── runs/             # Read-only run & step trace queries
│   │   │       ├── background-jobs/
│   │   │       └── health/           # Checks Runner DB + Redis + Worker heartbeat
│   │   └── src/server/               # Runner DB connection (runner.*), FlowRunner, BullMQ producers
│   │
│   └── worker/                       # Standalone BullMQ Worker Process (Runner-only)
│       ├── index.ts                  # Connects to Redis + Runner DB, publishes heartbeat
│       └── processors/               # outboundProcessor, statusProcessor, webhookForwarder
```

---

## 4. Data Ownership & Database Isolation

### Two Deployment Options

- **Option A (Target Design — Fully Separate Databases)**:
  - `whatsapp_studio_db` (MSSQL): Accessible only by Studio (`studio_app_login`).
  - `whatsapp_runner_db` (MSSQL): Accessible only by Runner & Worker (`runner_app_login`).
  - **Zero cross-DB queries**. Any config Runner needs at runtime (e.g., `phone_number_id`, `callback_url`, `webhook_allowlist`, API key hash/scopes, or `flow_package`) is pushed by Studio as an immutable deployment/config snapshot or fetched via signed internal API—never by reading Studio tables directly, and **never** including raw Meta access tokens or app secrets in flow JSON.

- **Option B (MVP Step — One MSSQL Database, Two Schemas + Separate Logins)**:
  - Single database `whatsapp_engine` with two schemas: `studio.*` and `runner.*`.
  - `studio_login` has `SELECT/INSERT/UPDATE/DELETE` on `studio.*` only (and optional `SELECT` on `runner.deployed_flows` / `runner.runs` *only* if viewing directly, though API-based reporting is preferred so moving to Option A requires zero code changes).
  - `runner_login` has `SELECT/INSERT/UPDATE/DELETE` on `runner.*` only, and `DENY` on `studio.*`.

### Table Ownership Matrix

| Table (Option B Schema) | Option A DB | Owner | Who May Read | Who May Write |
| :--- | :--- | :--- | :--- | :--- |
| `studio.ENGINE_USERS`, `ENGINE_ROLES`, `USER_WA_ACCOUNTS` | `studio_db` | **Studio** | Studio | Studio |
| `studio.ENGINE_PROJECTS`, `ENGINE_PROJECT_MEMBERS` | `studio_db` | **Studio** | Studio | Studio |
| `studio.WA_BUSINESS_ACCOUNTS`, `WA_ACCOUNT_CREDENTIALS`, `WA_PHONE_NUMBERS`, `WA_PROJECT_MAPPINGS` | `studio_db` | **Studio** | Studio (encrypted creds never leave Studio APIs) | Studio |
| `studio.ENGINE_API_KEYS` / `api_keys` | `studio_db` | **Studio** | Studio (Runner receives hashed key sync or verifies via token) | Studio |
| `studio.webhook_allowlist` / `ENGINE_WEBHOOK_ALLOWLIST` | `studio_db` | **Studio** | Studio (synced per-project into Runner runtime config) | Studio |
| `studio.workflows` (drafts & editor graph), `studio.workflow_versions` *(new)* | `studio_db` | **Studio** | Studio | Studio |
| `studio.deployments` *(new)* | `studio_db` | **Studio** | Studio | Studio (updated by Runner status webhook) |
| `studio.audit_logs` / `ENGINE_AUDIT_LOGS` | `studio_db` | **Studio** | Studio | Studio |
| `runner.deployed_flows` *(new — immutable packages)* | `runner_db` | **Runner** | Runner | Runner (only via Push or Import) |
| `runner.workflow_runs` / `ENGINE_FLOW_RUNS` | `runner_db` | **Runner** | Runner (Studio views via Runner API) | Runner |
| `runner.workflow_audit_log` / `ENGINE_RUN_STEPS` | `runner_db` | **Runner** | Runner | Runner |
| `runner.WA_CUSTOMERS`, `WA_CONVERSATIONS`, `ENGINE_REQUEST_LOGS` | `runner_db` | **Runner** | Runner | Runner |
| `runner.WA_MESSAGES`, `ENGINE_IDEMPOTENCY_KEYS` | `runner_db` | **Runner** | Runner | Runner |
| `runner.WA_WEBHOOK_EVENTS`, `ENGINE_CALLBACK_DELIVERIES` | `runner_db` | **Runner** | Runner | Runner |
| `runner.campaigns`, `campaign_recipients` | `runner_db` | **Runner** | Runner | Runner |
| `runner.audit_logs` | `runner_db` | **Runner** | Runner | Runner |
| **Redis / BullMQ** (`outbound-messages`, `webhook-forwarding`, `status-updates`, rate limits, worker heartbeat) | Runner-only | **Runner** | Runner & Worker | Runner & Worker |

> **Note on Meta Credentials for Outbound Sends**: Runner still needs to send messages to Meta Graph API. In Option A/B, Runner must receive its own scoped execution credentials via environment/vault (e.g., KMS/KeyVault or encrypted runtime secret sync separate from flow JSON), **never** embedded inside `FlowPackage` JSON and **never** returned to any browser endpoint.

---

## 5. Flow Package Specification

The **only** artifact that crosses the Studio → Runner boundary (via HTTP push or `.flow.json` file import) is an immutable `FlowPackage`.

### 5.1 JSON Structure

```json
{
  "packageVersion": "1.0",
  "flowId": "wf_1795601234",
  "version": 4,
  "projectId": "proj_default",
  "phoneNumberId": "355139157678636",
  "name": "Clinic Appointment Booking",
  "trigger": {
    "type": "keyword",
    "value": "BOOK, APPOINTMENT",
    "priority": 10
  },
  "graph": {
    "nodes": [
      { "id": "n1", "type": "trigger", "position": { "x": 60, "y": 180 }, "data": { "keyword": "BOOK" } }
    ],
    "edges": []
  },
  "runtimePolicy": {
    "allowedHosts": ["api.clinic.example.com"],
    "maxSteps": 50,
    "sessionTtlSeconds": 86400
  },
  "dependencies": [
    { "flowId": "wf_sub_confirm", "version": 2, "mode": "subflow" }
  ],
  "issuedAt": "2026-11-26T10:00:00.000Z",
  "issuedBy": "usr_admin_01",
  "contentHash": "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "signature": "hmac-sha256:4a7d1ed414474e4033ac29ccb8653d9b..."
}
```

### 5.2 Hashing, Signing & Validation

1. **Secret Scrubbing**: Before hashing, Studio strips any accidental secret fields and rejects `graph` nodes containing hardcoded `Bearer ` tokens or private/loopback URLs (`isSafeOutboundUrl`).
2. **Canonical Content Hash (`contentHash`)**: Compute `SHA-256` over a deterministic canonical JSON string (sorted keys) of `{ packageVersion, flowId, version, projectId, phoneNumberId, name, trigger, graph, runtimePolicy, dependencies }`.
3. **Signature (`signature`)**:
   - **MVP**: `HMAC-SHA256(contentHash + "." + issuedAt, DEPLOY_SIGNING_SECRET)` (shared between Studio signer and Runner verifier).
   - **Target**: Asymmetric **Ed25519** private key in Studio, public key in Runner (so Runner cannot forge packages even if compromised).
4. **Shared Validation**: Both Studio (before push/export) and Runner (on `/api/internal/deploy` and `/api/flows/import`) execute `packages/flow-contract` `validateFlowPackage(pkg)`:
   - Verifies Zod schema (`workflowGraphSchema`), `contentHash` integrity, and `signature`.
   - Runs `validateGraph(pkg.graph)` and `validateCrossFlows()` (ensuring any `goto_flow` target exists and is active on the Runner).
   - Rejects any package containing raw secrets or non-allowlisted/private URLs.

### 5.3 Activation & Rollback

- Each `(flowId, version)` stored in `runner.deployed_flows` is **immutable** (`is_readonly = 1`).
- **Activation**: Runner runs a DB transaction setting `status = 'inactive'` on previous versions of `flowId` and `status = 'active'` on the newly deployed version. Existing `workflow_runs` pinned to `workflow_version = N-1` finish on `N-1`; new conversations start on `N`.
- **Rollback**:
  - From **Studio**: Redeploying version `N-1` (or calling Runner `/api/internal/deploy/activate` with `{ flowId, version: N-1 }`) flips the active pointer back to `N-1` without modifying the immutable snapshot.
  - From **Runner**: Operators can **Enable**, **Disable**, **Pause** (stops new triggers while letting in-flight runs finish), or **Delete** inactive versions, **never** edit nodes/edges.

---

## 6. Deploy Sequence (Studio → Runner)

```text
Studio UI          Studio API             Runner API              Runner DB           Studio API
   |                   |                      |                       |                   |
   |-- Click Deploy -->|                      |                       |                   |
   |                   |-- 1. Validate Graph  |                       |                   |
   |                   |-- 2. Scrub Secrets   |                       |                   |
   |                   |-- 3. Bump Version    |                       |                   |
   |                   |-- 4. Hash + Sign     |                       |                   |
   |                   |-- 5. Save deployment |                       |                   |
   |                   |   (status=pending)   |                       |                   |
   |                   |                      |                       |                   |
   |                   |-- 6. POST /api/internal/deploy ------------->|                   |
   |                   |   (Bearer S2S JWT + FlowPackage)             |                   |
   |                   |                      |-- 7. Verify JWT,      |                   |
   |                   |                      |   Hash, Sig, Schema   |                   |
   |                   |                      |-- 8. TX: Insert       |                   |
   |                   |                      |   deployed_flows      |                   |
   |                   |                      |   & set active ------>|                   |
   |                   |<-- 9. 200 OK { deploymentId, status: active }|                   |
   |                   |                      |                       |                   |
   |                   |-- 10. Update deployment (active)             |                   |
   |<-- Show Active ---|                      |                       |                   |
   |                   |                      |-- (Async / Retry) POST /api/deployments/status
```

### Failure Handling

- **Validation / Signature Failure (`400` / `401` / `422`)**: Runner rejects immediately, logs `deploy_rejected` to `runner.audit_logs`, and Studio marks `deployments.status = 'failed'` with the exact validation error details.
- **Network Timeout / Runner Unreachable (`502` / `504`)**: Studio marks `deployments.status = 'failed_unreachable'` and allows a safe idempotent retry using the same `(flowId, version, contentHash)`.
- **Partial Dependency Failure**: If a `goto_flow` target sub-flow is missing or inactive in Runner, Runner returns `422 DEPENDENCY_MISSING` before touching the active version, keeping the previous version live.

---

## 7. Auth Between Systems

1. **Studio → Runner (Push / Activate / Pause)**:
   - **Service-to-Service JWT (`RS256` or `HS256` with dedicated `STUDIO_RUNNER_S2S_SECRET`)** + `X-Studio-Timestamp` + `X-Studio-Nonce` (rejects requests older than 60s to prevent replay).
   - Scoped claims: `{ iss: "wa-studio", aud: "wa-runner", sub: studioUserId, scope: "flows:deploy", jti }`.
   - Optional mTLS or IP allowlist at the reverse proxy/VPC level in production.
2. **Runner → Studio (Deployment Status & Logs)**:
   - **Push callbacks**: Runner signs `POST /api/deployments/status` with `X-Runner-Signature-256` (`HMAC-SHA256`) using `RUNNER_CALLBACK_SECRET`.
   - **Log viewing**: Runner exposes read-only `GET /api/runs`, `GET /api/runs/[runId]` authenticated by either user session JWT (for Runner UI) or S2S JWT with `scope: "runs:read"` (if Studio embeds a read-only run drawer).

---

## 8. Security Checklist

- **Secrets Handling**:
  - `WA_ACCOUNT_CREDENTIALS`, `APP_SECRET`, `ENCRYPTION_MASTER_KEY`, `JWT_SECRET`, and `API_KEY_PEPPER` **never** appear in `FlowPackage` JSON, browser responses, or client bundles.
  - Enforce `STRICT_SECRETS=true` in production so [config/index.ts](file:///c:/Users/ppvar/Desktop/engine/engine/src/server/config/index.ts) fails closed if any secret is missing.
- **Audit Logging for Failed / Unauthorized Requests**:
  - Every `401` (invalid JWT, expired API key, bad S2S signature, bad Meta `X-Hub-Signature-256`) and `403` (missing scope, disallowed recipient, SSRF blocked, non-admin publish/deploy) must write to `audit_logs` with `request_id`, `ip`, `endpoint`, `reason`, and masked recipient.
- **Role Permissions (`user`, `admin`, `superadmin`)**:
  - **Fix `hasPermission()` in [permissions.ts](file:///c:/Users/ppvar/Desktop/engine/engine/src/server/security/permissions.ts)**: Currently `hasPermission()` unconditionally returns `true` for all roles! Enforce `ROLE_PERMISSIONS[role]?.includes(permission)`:
    - `user`: View flows/runs, run test/demo, read-only inbox; **cannot** edit Meta credentials, API keys, allowlist, or deploy/publish.
    - `admin`: Manage project workflows, templates, phone mappings, API keys, allowlist, and deploy to Runner.
    - `superadmin`: Manage multi-WABA accounts, global credentials, users/roles, and Runner registrations.
- **Read-Only Enforcement on Imported & Pushed Flows**:
  - Runner **must not** expose any `PUT /api/flows/[id]` graph-editing route.
  - `runner.deployed_flows` enforces `is_readonly = 1`; only `status` (`active` / `paused` / `disabled`) and deletion of inactive flows are permitted.
- **SSRF & Outbound Safety**:
  - Keep per-project allowlists in [webhookAllowlist.ts](file:///c:/Users/ppvar/Desktop/engine/engine/src/server/security/webhookAllowlist.ts) and `isSafeOutboundUrl()` checks in [webhookDispatcher.ts](file:///c:/Users/ppvar/Desktop/engine/engine/src/server/services/webhookDispatcher.ts) and Runner's `api` node executor.

---

## 9. Risks & Open Questions

### Concrete Risks Found in Current Codebase

1. **Broken RBAC Enforcement**: [permissions.ts](file:///c:/Users/ppvar/Desktop/engine/engine/src/server/security/permissions.ts#L27-L30) has `hasPermission()` hardcoded to `return true`, forcing ad-hoc `if (auth.user.role === "user")` checks in routes like [publish/route.ts](file:///c:/Users/ppvar/Desktop/engine/engine/src/app/api/workflows/%5Bid%5D/publish/route.ts#L19).
2. **Duplicate Workflow Engines & UIs**: Both `src/server/engine/` (`ENGINE_FLOWS`) and `src/server/workflows/` (`workflows`) exist and are both invoked in [webhooks/whatsapp/meta/route.ts](file:///c:/Users/ppvar/Desktop/engine/engine/src/app/webhooks/whatsapp/meta/route.ts#L228-L250), alongside duplicate UIs (`src/app/(dashboard)/workflow/` + `src/components/workflow/` vs. `src/app/(dashboard)/workflows/` + `src/components/workflows/`).
3. **API Key Table Split**: [guards.ts](file:///c:/Users/ppvar/Desktop/engine/engine/src/server/security/guards.ts) supports `api_keys` (`007`) and legacy `ENGINE_API_KEYS` (`001`); this must be unified into `studio.api_keys` (with hashed key sync to Runner) before splitting DBs.
4. **In-Memory Fallbacks Masking Missing DB/Redis**: Repositories and [MessagingService](file:///c:/Users/ppvar/Desktop/engine/engine/src/server/services/messagingService.ts#L22-L23) (`idempotencyStore`, `customerInboundActivity`) fall back to process memory when MSSQL/Redis fail, which breaks multi-instance Runner scaling and violates the "no mock/fake state" rule.
5. **Migration History Hazard**: Two `009_*.sql` files exist; [009_drop_all_constraints.sql](file:///c:/Users/ppvar/Desktop/engine/engine/src/server/database/migrations/009_drop_all_constraints.sql) was neutralized, but FK/unique constraints from `001`–`008` should be audited and explicitly re-applied per schema.
6. **Hardcoded Runtime Config Reads**: [config/index.ts](file:///c:/Users/ppvar/Desktop/engine/engine/src/server/config/index.ts) couples Studio vars (`GROQ_API_KEY`, `ENCRYPTION_MASTER_KEY`) and Runner vars (`REDIS_HOST`, `WEBHOOK_VERIFY_TOKEN`) in a single Zod schema.

### Open Questions Requiring Decisions

1. **Meta Credentials on Runner**: Will Runner receive per-WABA decrypted tokens via a secrets manager (Azure Key Vault / AWS Secrets Manager) or an encrypted runtime sync from Studio? (They cannot live in `FlowPackage` JSON.)
2. **API Key Validation on Runner**: Should Studio push hashed API key projections (`key_prefix`, `key_hash`, `scopes`, `allowed_recipients`, `rate_limit_per_minute`, `phone_number_id`) to Runner on key create/update/revoke, or should Runner call Studio's internal introspection endpoint (with short Redis caching)?
3. **Campaigns Ownership**: Should `/campaigns` be authored in Studio and pushed as a job batch to Runner, or managed directly in Runner?
4. **Legacy `src/server/engine/` & `/workflow` Route**: Confirm timeline for migrating any remaining `ENGINE_FLOWS` records to `workflows` and retiring `src/server/engine/`.
5. **Multi-Runner Routing**: When Studio pushes to multiple Runners (e.g., staging vs. production, or regional Runners), how are target Runner URLs and S2S keys registered per project/environment?

---

## 10. Phased Migration Plan (Zero-Downtime, Working App After Every Phase)

### Phase 1: Fix Shared Foundations & Security (In-Place)
- Fix `hasPermission()` in [permissions.ts](file:///c:/Users/ppvar/Desktop/engine/engine/src/server/security/permissions.ts) to enforce `ROLE_PERMISSIONS`.
- Split [config/index.ts](file:///c:/Users/ppvar/Desktop/engine/engine/src/server/config/index.ts) env validation into `studioConfig` and `runnerConfig` sections.
- Retire or freeze `src/server/engine/` and consolidate all authoring onto `src/server/workflows/`.
- **Verify (PowerShell)**:
  ```powershell
  npx tsc --noEmit
  npm test
  ```

### Phase 2: Extract `packages/flow-contract` & Immutable `FlowPackage`
- Move `types.ts`, `validation.ts`, `crossFlowValidation.ts`, `permissions.ts`, and `phone.ts` into `packages/flow-contract`.
- Implement canonical hashing (`SHA-256`) and signing (`HMAC-SHA256` / `Ed25519`).
- Add `POST /api/workflows/[id]/export` (downloads signed `.flow.json`) and `POST /api/flows/import` (validates & stores read-only in `deployed_flows`).
- **Verify (PowerShell)**:
  ```powershell
  npx tsc --noEmit
  npm test
  ```

### Phase 3: Option B Database Schema Split (`studio.*` & `runner.*`)
- Add migration `011_split_studio_runner_schemas.sql` creating `studio` and `runner` schemas, `studio.workflow_versions`, `studio.deployments`, `runner.deployed_flows`, and separate SQL logins (`studio_login`, `runner_login`).
- Update Studio repositories to use `studio.*` and Runner repositories to use `runner.*`.
- **Verify (PowerShell)**:
  ```powershell
  npm run db:migrate
  npm run build
  ```

### Phase 4: Implement Push Deploy & S2S Auth
- Add `POST /api/internal/deploy` and `POST /api/internal/deploy/activate` on Runner with S2S JWT + replay protection.
- Wire Studio's **Deploy** button in [workflows/[id]/page.tsx](file:///c:/Users/ppvar/Desktop/engine/engine/src/app/(dashboard)/workflows/%5Bid%5D/page.tsx) to sign & push `FlowPackage` to Runner and record status in `studio.deployments`.
- Update `FlowRunner` and `WorkflowTriggerMatcher` to read **only** from `runner.deployed_flows` (never `studio.workflows`).

### Phase 5: Split into Two Deployable Apps (`apps/studio` & `apps/runner`)
- Move Studio pages/APIs into `apps/studio` (no BullMQ/Redis dependency).
- Move Runner pages/APIs (`webhooks`, `v1/messages`, `runs`, `background-jobs`, `flows` read-only viewer) into `apps/runner` + `apps/worker`.
- Update [docker-compose.yml](file:///c:/Users/ppvar/Desktop/engine/engine/docker-compose.yml) to run `studio`, `runner`, `worker`, `mssql`, and `redis` as independent services.

### Phase 6: Option A Database Separation
- Provision `whatsapp_studio_db` and `whatsapp_runner_db` on separate MSSQL instances/databases.
- Point `apps/studio` connection string to `whatsapp_studio_db` and `apps/runner` + `apps/worker` to `whatsapp_runner_db`.
- Remove any remaining Option B cross-schema grants.
