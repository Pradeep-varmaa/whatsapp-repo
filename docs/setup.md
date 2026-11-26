# Setup & Deployment Guide — WhatsApp Communication Engine

## 1. Quick Start (Mock / Demo Mode)

The engine can run immediately in **Mock / Demo Mode** without live Meta credentials or a local MSSQL server. The repository layer will seamlessly provide rich in-memory mock data.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (uses mock mode by default)
cp .env.example .env

# 3. Start the Next.js App
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the WhatsApp Green glassmorphism console.

---

## 2. Running the Dedicated Background Worker

In a separate terminal, launch the BullMQ background worker process:

```bash
npm run worker
```

The worker listens on Redis queues:
- `outbound-messages`
- `webhook-forwarding`
- `status-updates`

---

## 3. Local MSSQL & Redis via Docker Compose

To spin up real Microsoft SQL Server and Redis instances locally:

```bash
# Start MSSQL and Redis in background
docker compose up -d

# Check container health
docker compose ps
```

### Apply Migrations & Seed Data:
```bash
# Run SQL Server migrations (17 tables)
npm run db:migrate

# Populate initial demo records
npm run db:seed
```

---

## 4. Connecting Live Meta WhatsApp Cloud API

When ready to switch from sandbox simulation to live production Meta messaging:

1. In `.env`, change:
   ```env
   APP_MODE=live
   ```
2. In your [Meta App Dashboard](https://developers.facebook.com):
   - Obtain your **Meta App ID** & **App Secret**.
   - Create a **System User** in Meta Business Manager with permissions: `whatsapp_business_messaging`, `whatsapp_business_management`.
   - Generate a permanent System User Token and assign it to `META_SYSTEM_USER_ACCESS_TOKEN`.
   - Copy your **WABA ID** and **Phone Number ID**.
3. In Meta Webhook Configuration:
   - Set Callback URL: `https://<YOUR_PUBLIC_DOMAIN>/webhooks/whatsapp/meta`
   - Set Verify Token: value of `META_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to the `messages` field.
