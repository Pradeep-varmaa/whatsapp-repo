-- =============================================================================
-- Migration: 003_messaging_and_conversations.sql
-- Description: Customers, Conversations, and Messages
-- (All foreign keys and restrictive unique constraints removed)
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WA_CUSTOMERS')
BEGIN
    CREATE TABLE WA_CUSTOMERS (
        customer_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        phone_number NVARCHAR(50) NOT NULL, -- E.164 format, e.g. +14155552671
        display_name NVARCHAR(150) NULL,
        profile_name NVARCHAR(150) NULL,
        country_code NVARCHAR(10) NULL,
        metadata_json NVARCHAR(MAX) NOT NULL DEFAULT '{}',
        opt_in_status BIT NOT NULL DEFAULT 1,
        opt_in_timestamp DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_WA_CUSTOMERS_PHONE ON WA_CUSTOMERS(phone_number);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WA_CONVERSATIONS')
BEGIN
    CREATE TABLE WA_CONVERSATIONS (
        conversation_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        project_id NVARCHAR(64) NOT NULL,
        phone_number_id NVARCHAR(64) NOT NULL,
        customer_id NVARCHAR(64) NOT NULL,
        meta_conversation_id NVARCHAR(128) NULL,
        status NVARCHAR(30) NOT NULL DEFAULT 'open', -- open, closed, archived, pending
        category NVARCHAR(50) NOT NULL DEFAULT 'service', -- service, utility, marketing, authentication
        window_expires_at DATETIME2 NULL, -- 24-hour service window expiry
        last_message_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        last_message_snippet NVARCHAR(500) NULL,
        last_message_direction NVARCHAR(10) NOT NULL DEFAULT 'inbound', -- inbound, outbound
        unread_count INT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_WA_CONVERSATIONS_PROJECT ON WA_CONVERSATIONS(project_id, phone_number_id, customer_id);
    CREATE INDEX IX_WA_CONVERSATIONS_LAST_MSG ON WA_CONVERSATIONS(last_message_at DESC);
    CREATE INDEX IX_WA_CONVERSATIONS_STATUS ON WA_CONVERSATIONS(status);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WA_MESSAGES')
BEGIN
    CREATE TABLE WA_MESSAGES (
        message_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        wamid NVARCHAR(128) NULL, -- Meta WhatsApp Message ID (e.g. wamid.HBgL...)
        idempotency_key NVARCHAR(128) NULL,
        project_id NVARCHAR(64) NOT NULL,
        phone_number_id NVARCHAR(64) NOT NULL,
        customer_id NVARCHAR(64) NOT NULL,
        conversation_id NVARCHAR(64) NULL,
        direction NVARCHAR(10) NOT NULL, -- outbound, inbound
        message_type NVARCHAR(30) NOT NULL DEFAULT 'text', -- text, template, image, document, audio, video, interactive, location
        content_text NVARCHAR(MAX) NULL,
        template_name NVARCHAR(150) NULL,
        template_language NVARCHAR(10) NULL,
        template_parameters_json NVARCHAR(MAX) NULL,
        media_url NVARCHAR(1000) NULL,
        media_mime_type NVARCHAR(100) NULL,
        status NVARCHAR(30) NOT NULL DEFAULT 'queued', -- queued, sending, sent, delivered, read, failed
        error_code NVARCHAR(50) NULL,
        error_message NVARCHAR(1000) NULL,
        retry_count INT NOT NULL DEFAULT 0,
        is_mock BIT NOT NULL DEFAULT 0,
        sent_at DATETIME2 NULL,
        delivered_at DATETIME2 NULL,
        read_at DATETIME2 NULL,
        raw_payload_json NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_WA_MESSAGES_WAMID ON WA_MESSAGES(wamid);
    CREATE INDEX IX_WA_MESSAGES_IDEMPOTENCY ON WA_MESSAGES(idempotency_key);
    CREATE INDEX IX_WA_MESSAGES_STATUS ON WA_MESSAGES(status);
    CREATE INDEX IX_WA_MESSAGES_PROJECT ON WA_MESSAGES(project_id, created_at DESC);
    CREATE INDEX IX_WA_MESSAGES_CUSTOMER ON WA_MESSAGES(customer_id, created_at DESC);
END;
