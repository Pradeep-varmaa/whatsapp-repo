# Architecture Documentation — WhatsApp Communication Engine

## 1. System Overview

The **WhatsApp Communication Engine** is an enterprise-grade, multi-tenant communication platform designed to centralize and decouple WhatsApp messaging operations from internal business services. It provides high-throughput message dispatching, resilient incoming Meta webhook ingestion, event forwarding with exponential retries, and strict project data isolation.

```text
Internal Microservices & Business Apps (e.g. E-Commerce, KYC, Support)
                          │
                          ▼ (HTTPS with Project API Key)
              ┌────────────────────────┐
              │    Next.js App Router  │
              │   REST API Gateway &   │
              │  Glassmorphism Console │
              └───────────┬────────────┘
                          │
       ┌──────────────────┴──────────────────┐
       ▼                                     ▼
┌──────────────┐                      ┌──────────────┐
│  Repository  │                      │ BullMQ Queue │
│    Layer     │                      │   Producer   │
└──────┬───────┘                      └──────┬───────┘
       │ Parameterized                       │ Redis Broker
       ▼ SQL Queries                         ▼
┌──────────────┐                      ┌──────────────┐
│    MSSQL     │                      │  Dedicated   │
│   Database   │                      │ Node Worker  │
└──────────────┘                      └──────┬───────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
             ┌──────────────────┐                        ┌──────────────────┐
             │ Meta Graph API   │                        │ Project Callback │
             │ (v21.0 Cloud)    │                        │ Forwarding Hooks │
             └──────────────────┘                        └──────────────────┘
```

## 2. Key Architecture Pillars

### 2.1 Repository Pattern (No ORMs)
To guarantee high performance and strict control over SQL Server query execution plans:
- Direct parameterized SQL statements executed via the `mssql` node driver.
- Zero reliance on heavyweight ORMs (Prisma, Sequelize, TypeORM).
- Resilient dual-stack fallback: when MSSQL is initializing or unavailable in local sandbox testing, the repositories transparently utilize an in-memory repository without crashing the frontend.

### 2.2 Decoupled Asynchronous Workers
Next.js serverless and server-rendered routes are kept lightweight:
- Next.js route handlers validate incoming requests and enqueue tasks into Redis.
- A dedicated long-running background process (`worker/index.ts`) consumes tasks using BullMQ.
- Retries utilize exponential backoff (e.g., 5s, 10s, 20s, 40s) to absorb downstream partner outages without dropping webhooks or messages.

### 2.3 Provider Abstraction & Dual-Mode Sandbox
- `WhatsAppProvider` interface abstracts WhatsApp capabilities.
- `MetaWhatsAppProvider`: Connects to `https://graph.facebook.com/v21.0` using validated Meta access tokens.
- `MockWhatsAppProvider`: Returns simulated responses with explicit `isMock: true` markers, allowing offline UI and integration testing without incurring Meta per-conversation charges.

### 2.4 Cryptographic Security Layer
- **Token Encryption**: System user access tokens and partner credentials are encrypted at rest using **AES-256-GCM** with unique IV and auth tag.
- **API Key Hashing**: Only salted SHA-256 hashes of project API keys are stored. Plaintext keys are shown only once upon generation.
- **Webhook Signature Verification**: Incoming Meta webhooks are authenticated via HMAC-SHA256 (`x-hub-signature-256`), and outbound callbacks sent to client services are signed with each project's distinct signing secret.
