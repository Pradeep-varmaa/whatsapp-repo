-- =============================================================================
-- Migration: 001_engine_auth_and_projects.sql
-- Description: Core Users, Roles, Projects, Project Members, and API Keys
-- (All foreign keys and restrictive unique constraints removed)
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_ROLES')
BEGIN
    CREATE TABLE ENGINE_ROLES (
        role_id NVARCHAR(50) NOT NULL PRIMARY KEY,
        role_name NVARCHAR(100) NOT NULL,
        description NVARCHAR(255) NULL,
        permissions_json NVARCHAR(MAX) NOT NULL DEFAULT '[]',
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_USERS')
BEGIN
    CREATE TABLE ENGINE_USERS (
        user_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        email NVARCHAR(255) NOT NULL,
        password_hash NVARCHAR(255) NOT NULL,
        full_name NVARCHAR(150) NOT NULL,
        role_id NVARCHAR(50) NOT NULL DEFAULT 'viewer',
        status NVARCHAR(30) NOT NULL DEFAULT 'active', -- active, suspended, invited
        last_login_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ENGINE_USERS_EMAIL ON ENGINE_USERS(email);
    CREATE INDEX IX_ENGINE_USERS_STATUS ON ENGINE_USERS(status);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_PROJECTS')
BEGIN
    CREATE TABLE ENGINE_PROJECTS (
        project_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        name NVARCHAR(150) NOT NULL,
        slug NVARCHAR(100) NOT NULL,
        description NVARCHAR(500) NULL,
        status NVARCHAR(30) NOT NULL DEFAULT 'active', -- active, inactive, archived
        callback_url NVARCHAR(500) NULL,
        event_types_json NVARCHAR(MAX) NOT NULL DEFAULT '["message.received","message.sent","message.delivered","message.read","message.failed"]',
        webhook_signing_secret NVARCHAR(255) NULL,
        created_by NVARCHAR(64) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ENGINE_PROJECTS_SLUG ON ENGINE_PROJECTS(slug);
    CREATE INDEX IX_ENGINE_PROJECTS_STATUS ON ENGINE_PROJECTS(status);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_PROJECT_MEMBERS')
BEGIN
    CREATE TABLE ENGINE_PROJECT_MEMBERS (
        membership_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        project_id NVARCHAR(64) NOT NULL,
        user_id NVARCHAR(64) NOT NULL,
        project_role NVARCHAR(50) NOT NULL DEFAULT 'member', -- owner, admin, member, viewer
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_PROJECT_MEMBERS_PROJ ON ENGINE_PROJECT_MEMBERS(project_id);
    CREATE INDEX IX_PROJECT_MEMBERS_USER ON ENGINE_PROJECT_MEMBERS(user_id);
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_API_KEYS')
BEGIN
    CREATE TABLE ENGINE_API_KEYS (
        key_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        project_id NVARCHAR(64) NOT NULL,
        key_name NVARCHAR(150) NOT NULL,
        key_prefix NVARCHAR(16) NOT NULL, -- e.g. wac_live_abc1
        key_hash NVARCHAR(255) NOT NULL, -- SHA-256 hash with salt
        scopes_json NVARCHAR(MAX) NOT NULL DEFAULT '["messages.write","messages.read","templates.read"]',
        status NVARCHAR(30) NOT NULL DEFAULT 'active', -- active, revoked, expired
        expires_at DATETIME2 NULL,
        last_used_at DATETIME2 NULL,
        created_by NVARCHAR(64) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ENGINE_API_KEYS_PROJECT ON ENGINE_API_KEYS(project_id);
    CREATE INDEX IX_ENGINE_API_KEYS_HASH ON ENGINE_API_KEYS(key_hash);
    CREATE INDEX IX_ENGINE_API_KEYS_STATUS ON ENGINE_API_KEYS(status);
END;
