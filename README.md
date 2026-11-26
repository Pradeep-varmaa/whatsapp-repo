# Centralized WhatsApp Communication Engine

A production-oriented platform built to unify, route, and scale WhatsApp Business Cloud API communication across multiple internal projects and microservices.

Featuring a refined **WhatsApp Green Glassmorphism** dashboard, Next.js App Router, parameterized MSSQL repository architecture, BullMQ background workers, and resilient dual-mode mock/live execution.

---

## 🌟 Highlights & Features

- **WhatsApp Green Glassmorphism Design System**: Tailored enterprise dark theme (`#25D366`, `#075E54`, `#0B141A`, `#111B21`) with translucent blur panels, soft borders, and controlled green glow effects.
- **Next.js App Router**: Full-stack unified architecture with Server Components and Client Components where interactivity requires it.
- **Repository Pattern on MSSQL**: 17 core relational tables managed via parameterized SQL queries with `mssql` (No ORMs).
- **Dual-Stack Mock/Live Fallback**: Runs out of the box in mock mode with realistic data; smoothly transitions to live MSSQL and Meta API without UI breakdown.
- **Dedicated BullMQ Background Worker**: Asynchronous queue processing for outbound messaging, status updates, and webhook forwarding with exponential backoff.
- **Interactive Messaging & Live Conversations**: Two-panel chat workspace with real-time bubble previews, status indicators (`sent`, `delivered`, `read`), and message dispatching.
- **Cryptographic Security Foundation**: AES-256-GCM token encryption, HMAC-SHA256 API key hashing, webhook signature verification, and secret redaction.

---

## 📂 Project Structure

```text
whatsapp-communication-engine/
├── src/
│   ├── app/
│   │   ├── (auth)/login/             # Dedicated authentication screen
│   │   ├── (dashboard)/              # Glassmorphism dashboard shell & pages
│   │   │   ├── overview/             # High-level KPIs, charts & health
│   │   │   ├── projects/             # Project listing, creation & callbacks
│   │   │   ├── whatsapp-accounts/    # WABA accounts & Meta Embedded Signup
│   │   │   ├── phone-numbers/        # Sender numbers & quality ratings
│   │   │   ├── messages/             # Outbound dispatches & send modal
│   │   │   ├── conversations/        # 2-panel live chat conversation threads
│   │   │   ├── templates/            # Template creation & visual phone mockup
│   │   │   ├── webhooks/             # Webhook logs & callback retries
│   │   │   ├── api-keys/             # API Key generation (hash only stored)
│   │   │   ├── background-jobs/      # BullMQ worker queue diagnostics
│   │   │   ├── audit-logs/           # Immutable security audit log
│   │   │   └── settings/             # Infrastructure & environment status
│   │   ├── api/
│   │   │   ├── health/               # Health check endpoint
│   │   │   └── v1/                   # REST API routes (projects, messages, etc.)
│   │   ├── webhooks/whatsapp/meta/   # Inbound Meta Webhook verification & handler
│   │   └── globals.css               # WhatsApp Green Glassmorphism variables
│   │
│   ├── components/
│   │   ├── layout/                   # Collapsible Sidebar & Top Navbar
│   │   └── providers/                # Ant Design dark theme configuration
│   │
│   ├── server/
│   │   ├── config/                   # Zod-validated environment config
│   │   ├── database/                 # MSSQL connection & 4 migration files
│   │   ├── repositories/             # Repositories for 10 entities + mock store
│   │   ├── services/                 # Messaging & project business logic
│   │   ├── integrations/meta/        # Meta WhatsApp provider + Mock provider
│   │   ├── queues/                   # BullMQ producers & queue manager
│   │   └── security/                 # AES-256-GCM encryption & API key hashing
│   │
│   └── shared/                       # Domain types, Zod schemas & constants
│
├── worker/                           # Dedicated BullMQ Node.js worker process
│   ├── index.ts                      # Worker entrypoint with graceful shutdown
│   ├── config/                       # Redis connection configuration
│   └── processors/                   # Outbound, webhook, and status processors
│
├── scripts/
│   ├── migrate.ts                    # MSSQL migration runner
│   └── seed.ts                       # MSSQL demo seeder
│
├── docs/
│   ├── architecture.md               # System architecture & data flow
│   ├── database-schema.md            # 17 MSSQL tables specification
│   ├── api-reference.md              # REST API endpoints & schemas
│   └── setup.md                      # Complete setup & deployment guide
│
├── docker-compose.yml                # Local MSSQL Server & Redis services
├── Dockerfile                        # Multi-stage production container build
└── package.json
```

---

## 🚀 Quick Start Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```
*(Default settings enable Mock Mode, allowing immediate testing without live Meta accounts)*

### 3. Start the Next.js Web Application
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Start the Dedicated Background Worker
In a separate terminal:
```bash
npm run worker
```

---

## 🗄️ Optional: Local MSSQL & Redis via Docker

To run real database and queue broker instances locally:
```bash
# 1. Start containers
docker compose up -d

# 2. Run migrations
npm run db:migrate

# 3. Seed demo data
npm run db:seed
```

---

## 🔑 WhatsApp Cloud API Configuration

Configure the 5 primary variables in your `.env` or `.env.local`:
- `PHONE_NUMBER_ID`: Your Meta WhatsApp Phone Number ID
- `ACCOUNT_ID`: Your WhatsApp Business Account ID (WABA ID)
- `APP_SECRET`: Your Meta App Secret (used for webhook HMAC-SHA256 signature verification)
- `MOBILE_NUMBER`: Your business sender mobile number
- `ACCESS_TOKEN`: Your Meta Permanent System User Access Token

To transition from Mock Mode to Live dispatches:
1. Set `APP_MODE=live` in `.env`.
2. Provide your `ACCESS_TOKEN`, `PHONE_NUMBER_ID`, `ACCOUNT_ID`, `APP_SECRET`, and `MOBILE_NUMBER`.
3. Configure the Meta Webhook URL:
   `https://<YOUR-DOMAIN>/webhooks/whatsapp/meta` with Verify Token `engine_verify_token_secure`.
