-- =============================================================================
-- Migration: 009_multi_account_and_project_scoping.sql
-- Description: Multi-account WhatsApp management, User tenancy mapping,
--              Project-level scoping under WABAs, and encrypted credential extensions.
-- =============================================================================

-- 1. USER_WA_ACCOUNTS (Mapping users to their authorized WhatsApp Business Accounts)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'USER_WA_ACCOUNTS')
BEGIN
    CREATE TABLE USER_WA_ACCOUNTS (
        mapping_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        user_id NVARCHAR(64) NOT NULL,
        waba_id NVARCHAR(64) NOT NULL,
        account_role NVARCHAR(50) NOT NULL DEFAULT 'user', -- user (default), admin, viewer
        is_default BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_USER_WA_ACCOUNTS_USER ON USER_WA_ACCOUNTS(user_id);
    CREATE INDEX IX_USER_WA_ACCOUNTS_WABA ON USER_WA_ACCOUNTS(waba_id);
END;

-- 2. Direct WABA association on ENGINE_PROJECTS
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ENGINE_PROJECTS') AND name = 'waba_id')
BEGIN
    ALTER TABLE ENGINE_PROJECTS ADD waba_id NVARCHAR(64) NULL;
END;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ENGINE_PROJECTS_WABA' AND object_id = OBJECT_ID('ENGINE_PROJECTS'))
BEGIN
    CREATE INDEX IX_ENGINE_PROJECTS_WABA ON ENGINE_PROJECTS(waba_id);
END;

-- 3. Extend WA_ACCOUNT_CREDENTIALS for zero-exposure per-account secrets
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('WA_ACCOUNT_CREDENTIALS') AND name = 'encrypted_app_secret')
BEGIN
    ALTER TABLE WA_ACCOUNT_CREDENTIALS ADD 
        encrypted_app_secret NVARCHAR(MAX) NULL,
        app_secret_iv NVARCHAR(64) NULL,
        app_secret_auth_tag NVARCHAR(64) NULL,
        webhook_verify_token NVARCHAR(128) NULL;
END;
