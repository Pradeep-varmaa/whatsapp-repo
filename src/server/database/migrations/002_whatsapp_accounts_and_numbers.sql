-- =============================================================================
-- Migration: 002_whatsapp_accounts_and_numbers.sql
-- Description: WABA accounts, phone numbers, encrypted credentials & mappings
-- (All foreign keys and restrictive unique constraints removed)
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WA_BUSINESS_ACCOUNTS')
BEGIN
    CREATE TABLE WA_BUSINESS_ACCOUNTS (
        waba_id NVARCHAR(64) NOT NULL PRIMARY KEY, -- Meta WABA ID
        account_name NVARCHAR(150) NOT NULL,
        currency NVARCHAR(10) NOT NULL DEFAULT 'USD',
        timezone_id NVARCHAR(50) NOT NULL DEFAULT 'UTC',
        message_template_namespace NVARCHAR(150) NULL,
        account_review_status NVARCHAR(50) NOT NULL DEFAULT 'APPROVED', -- APPROVED, PENDING, REJECTED
        business_verification_status NVARCHAR(50) NOT NULL DEFAULT 'verified', -- verified, unverified, in_review
        health_status NVARCHAR(30) NOT NULL DEFAULT 'HEALTHY', -- HEALTHY, WARNING, CRITICAL
        is_demo_mode BIT NOT NULL DEFAULT 0,
        meta_app_id NVARCHAR(64) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_WA_BUSINESS_ACCOUNTS_HEALTH ON WA_BUSINESS_ACCOUNTS(health_status);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WA_ACCOUNT_CREDENTIALS')
BEGIN
    CREATE TABLE WA_ACCOUNT_CREDENTIALS (
        credential_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        waba_id NVARCHAR(64) NOT NULL,
        encrypted_access_token NVARCHAR(MAX) NOT NULL, -- AES-256-GCM encrypted
        token_iv NVARCHAR(64) NOT NULL,
        token_auth_tag NVARCHAR(64) NOT NULL,
        token_type NVARCHAR(50) NOT NULL DEFAULT 'system_user', -- system_user, user_access
        expires_at DATETIME2 NULL, -- NULL for permanent system user token
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_WA_CREDENTIALS_WABA ON WA_ACCOUNT_CREDENTIALS(waba_id);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WA_PHONE_NUMBERS')
BEGIN
    CREATE TABLE WA_PHONE_NUMBERS (
        phone_number_id NVARCHAR(64) NOT NULL PRIMARY KEY, -- Meta Phone Number ID
        waba_id NVARCHAR(64) NOT NULL,
        display_phone_number NVARCHAR(50) NOT NULL, -- e.g. +1 555 123 4567
        verified_name NVARCHAR(150) NOT NULL,
        quality_rating NVARCHAR(20) NOT NULL DEFAULT 'GREEN', -- GREEN, YELLOW, RED, UNKNOWN
        code_verification_status NVARCHAR(30) NOT NULL DEFAULT 'VERIFIED', -- VERIFIED, NOT_VERIFIED
        messaging_limit_tier NVARCHAR(50) NOT NULL DEFAULT 'TIER_10K', -- TIER_1K, TIER_10K, TIER_100K, UNLIMITED
        status NVARCHAR(30) NOT NULL DEFAULT 'CONNECTED', -- CONNECTED, DISCONNECTED, FLAGGED, RESTRICTED
        is_default BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_WA_PHONE_NUMBERS_WABA ON WA_PHONE_NUMBERS(waba_id);
    CREATE INDEX IX_WA_PHONE_NUMBERS_DISPLAY ON WA_PHONE_NUMBERS(display_phone_number);
    CREATE INDEX IX_WA_PHONE_NUMBERS_STATUS ON WA_PHONE_NUMBERS(status);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WA_PROJECT_MAPPINGS')
BEGIN
    CREATE TABLE WA_PROJECT_MAPPINGS (
        mapping_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        project_id NVARCHAR(64) NOT NULL,
        waba_id NVARCHAR(64) NOT NULL,
        phone_number_id NVARCHAR(64) NOT NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_WA_PROJECT_MAPPINGS_PHONE ON WA_PROJECT_MAPPINGS(phone_number_id);
    CREATE INDEX IX_WA_PROJECT_MAPPINGS_PROJECT ON WA_PROJECT_MAPPINGS(project_id);
END;
