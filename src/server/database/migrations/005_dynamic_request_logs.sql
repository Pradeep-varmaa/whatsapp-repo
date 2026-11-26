-- =============================================================================
-- Migration: 005_dynamic_request_logs.sql
-- Description: Dynamic Request Logging for Server Dispatches and User Replies
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_REQUEST_LOGS')
BEGIN
    CREATE TABLE ENGINE_REQUEST_LOGS (
        request_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        source NVARCHAR(20) NOT NULL, -- 'server' (outbound dispatch) or 'user' (inbound reply)
        direction NVARCHAR(20) NOT NULL, -- 'outbound' or 'inbound'
        from_number NVARCHAR(50) NOT NULL,
        to_number NVARCHAR(50) NOT NULL,
        phone_number_id NVARCHAR(64) NULL,
        message_text NVARCHAR(MAX) NOT NULL,
        message_type NVARCHAR(30) NOT NULL DEFAULT 'text',
        webhook_url NVARCHAR(500) NULL,
        forward_status NVARCHAR(30) NULL, -- 'delivered', 'failed', 'pending'
        forward_status_code INT NULL,
        forward_response_body NVARCHAR(MAX) NULL,
        status NVARCHAR(30) NOT NULL, -- 'dispatched', 'received', 'failed'
        wamid NVARCHAR(128) NULL,
        error_code NVARCHAR(50) NULL,
        error_message NVARCHAR(MAX) NULL,
        metadata_json NVARCHAR(MAX) NULL,
        raw_payload_json NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_REQ_SOURCE ON ENGINE_REQUEST_LOGS(source);
    CREATE INDEX IX_REQ_DIRECTION ON ENGINE_REQUEST_LOGS(direction);
    CREATE INDEX IX_REQ_FROM ON ENGINE_REQUEST_LOGS(from_number);
    CREATE INDEX IX_REQ_TO ON ENGINE_REQUEST_LOGS(to_number);
END;
