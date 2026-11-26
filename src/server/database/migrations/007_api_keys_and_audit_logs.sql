-- =============================================================================
-- Migration: 007_api_keys_and_audit_logs.sql
-- Description: API Key Authentication and Public Endpoint Audit Logs
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'api_keys')
BEGIN
    CREATE TABLE api_keys (
        id NVARCHAR(64) NOT NULL PRIMARY KEY,
        name NVARCHAR(150) NOT NULL,
        key_prefix NVARCHAR(16) NOT NULL,
        key_hash NVARCHAR(255) NOT NULL,
        phone_number_id NVARCHAR(64) NOT NULL,
        project_id NVARCHAR(64) NULL,
        allowed_recipients NVARCHAR(MAX) NULL,
        scopes NVARCHAR(MAX) NOT NULL DEFAULT '["messages:send"]',
        rate_limit_per_minute INT NOT NULL DEFAULT 60,
        expires_at DATETIME2 NULL,
        revoked_at DATETIME2 NULL,
        last_used_at DATETIME2 NULL,
        created_by NVARCHAR(64) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_api_keys_prefix ON api_keys(key_prefix);
    CREATE INDEX IX_api_keys_hash ON api_keys(key_hash);
    CREATE INDEX IX_api_keys_phone ON api_keys(phone_number_id);
    CREATE INDEX IX_api_keys_revoked ON api_keys(revoked_at);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'audit_logs')
BEGIN
    CREATE TABLE audit_logs (
        id NVARCHAR(64) NOT NULL PRIMARY KEY,
        request_id NVARCHAR(64) NOT NULL,
        timestamp DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        event NVARCHAR(50) NOT NULL,
        outcome NVARCHAR(20) NOT NULL,
        reason NVARCHAR(50) NULL,
        key_prefix NVARCHAR(16) NULL,
        api_key_id NVARCHAR(64) NULL,
        ip NVARCHAR(45) NULL,
        user_agent NVARCHAR(500) NULL,
        endpoint NVARCHAR(255) NOT NULL,
        http_status INT NOT NULL,
        recipient_masked NVARCHAR(50) NULL,
        meta_message_id NVARCHAR(128) NULL,
        error_summary NVARCHAR(1000) NULL
    );
    CREATE INDEX IX_audit_logs_timestamp ON audit_logs(timestamp DESC);
    CREATE INDEX IX_audit_logs_event ON audit_logs(event);
    CREATE INDEX IX_audit_logs_outcome ON audit_logs(outcome);
    CREATE INDEX IX_audit_logs_key_prefix ON audit_logs(key_prefix);
    CREATE INDEX IX_audit_logs_api_key_id ON audit_logs(api_key_id);
    CREATE INDEX IX_audit_logs_request_id ON audit_logs(request_id);
END;
