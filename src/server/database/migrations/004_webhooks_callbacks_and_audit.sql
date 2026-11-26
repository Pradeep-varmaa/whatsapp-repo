-- =============================================================================
-- Migration: 004_webhooks_callbacks_and_audit.sql
-- Description: Incoming Webhooks, Project Callback Deliveries, Idempotency, and Audit Logs
-- (All foreign keys and restrictive unique constraints removed)
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WA_WEBHOOK_EVENTS')
BEGIN
    CREATE TABLE WA_WEBHOOK_EVENTS (
        event_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        meta_event_id NVARCHAR(128) NULL,
        event_type NVARCHAR(100) NOT NULL, -- messages, message_status, template_status, account_update
        phone_number_id NVARCHAR(64) NULL,
        waba_id NVARCHAR(64) NULL,
        payload_json NVARCHAR(MAX) NOT NULL,
        signature NVARCHAR(255) NULL,
        processing_status NVARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, processed, failed, ignored
        error_message NVARCHAR(1000) NULL,
        received_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        processed_at DATETIME2 NULL
    );
    CREATE INDEX IX_WA_WEBHOOK_EVENTS_TYPE ON WA_WEBHOOK_EVENTS(event_type);
    CREATE INDEX IX_WA_WEBHOOK_EVENTS_STATUS ON WA_WEBHOOK_EVENTS(processing_status);
    CREATE INDEX IX_WA_WEBHOOK_EVENTS_RECEIVED ON WA_WEBHOOK_EVENTS(received_at DESC);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_CALLBACK_CONFIG')
BEGIN
    CREATE TABLE ENGINE_CALLBACK_CONFIG (
        config_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        project_id NVARCHAR(64) NOT NULL,
        target_url NVARCHAR(500) NOT NULL,
        signing_secret NVARCHAR(255) NOT NULL,
        timeout_ms INT NOT NULL DEFAULT 10000,
        max_retries INT NOT NULL DEFAULT 5,
        retry_delay_seconds INT NOT NULL DEFAULT 5,
        is_active BIT NOT NULL DEFAULT 1,
        headers_json NVARCHAR(MAX) NOT NULL DEFAULT '{}',
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_CALLBACK_CONFIG_PROJ ON ENGINE_CALLBACK_CONFIG(project_id);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_CALLBACK_DELIVERIES')
BEGIN
    CREATE TABLE ENGINE_CALLBACK_DELIVERIES (
        delivery_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        project_id NVARCHAR(64) NOT NULL,
        event_type NVARCHAR(100) NOT NULL,
        source_event_id NVARCHAR(64) NULL,
        target_url NVARCHAR(500) NOT NULL,
        payload_json NVARCHAR(MAX) NOT NULL,
        status NVARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, sending, delivered, failed, exhausted
        http_status_code INT NULL,
        response_body NVARCHAR(MAX) NULL,
        attempt_count INT NOT NULL DEFAULT 0,
        next_retry_at DATETIME2 NULL,
        last_attempt_at DATETIME2 NULL,
        delivered_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_DELIVERY_PROJECT ON ENGINE_CALLBACK_DELIVERIES(project_id);
    CREATE INDEX IX_DELIVERY_STATUS ON ENGINE_CALLBACK_DELIVERIES(status);
    CREATE INDEX IX_DELIVERY_NEXT_RETRY ON ENGINE_CALLBACK_DELIVERIES(next_retry_at);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_IDEMPOTENCY_KEYS')
BEGIN
    CREATE TABLE ENGINE_IDEMPOTENCY_KEYS (
        idempotency_key NVARCHAR(128) NOT NULL PRIMARY KEY,
        project_id NVARCHAR(64) NOT NULL,
        request_path NVARCHAR(255) NOT NULL,
        request_hash NVARCHAR(64) NOT NULL,
        response_status_code INT NOT NULL,
        response_body NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        expires_at DATETIME2 NOT NULL
    );
    CREATE INDEX IX_IDEMPOTENCY_EXPIRES ON ENGINE_IDEMPOTENCY_KEYS(expires_at);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_AUDIT_LOGS')
BEGIN
    CREATE TABLE ENGINE_AUDIT_LOGS (
        log_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        user_id NVARCHAR(64) NULL,
        project_id NVARCHAR(64) NULL,
        action NVARCHAR(100) NOT NULL, -- e.g. project.create, message.send, api_key.generate
        resource_type NVARCHAR(100) NOT NULL, -- project, message, waba, api_key
        resource_id NVARCHAR(100) NULL,
        details_json NVARCHAR(MAX) NULL,
        ip_address NVARCHAR(45) NULL,
        user_agent NVARCHAR(500) NULL,
        status NVARCHAR(20) NOT NULL DEFAULT 'success', -- success, failure
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_AUDIT_LOGS_CREATED ON ENGINE_AUDIT_LOGS(created_at DESC);
    CREATE INDEX IX_AUDIT_LOGS_ACTION ON ENGINE_AUDIT_LOGS(action);
END;
