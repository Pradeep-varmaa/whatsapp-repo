-- =============================================================================
-- Migration: 008_workflow_builder.sql
-- Description: Drag-and-drop workflow builder: workflows, workflow_runs,
--              workflow_audit_log, and webhook_allowlist
-- (All foreign keys and restrictive unique constraints removed)
-- =============================================================================

-- 1. workflows
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'workflows')
BEGIN
    CREATE TABLE workflows (
        id NVARCHAR(64) NOT NULL PRIMARY KEY,
        project_id NVARCHAR(64) NOT NULL,
        phone_number_id NVARCHAR(64) NULL,
        name NVARCHAR(150) NOT NULL,
        trigger_type NVARCHAR(30) NOT NULL DEFAULT 'keyword', -- 'keyword' | 'any_reply' | 'first_message'
        trigger_value NVARCHAR(255) NULL,
        priority INT NOT NULL DEFAULT 0,
        status NVARCHAR(30) NOT NULL DEFAULT 'draft', -- 'draft' | 'active' | 'archived'
        version INT NOT NULL DEFAULT 1,
        graph_json NVARCHAR(MAX) NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
        created_by NVARCHAR(64) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_WORKFLOWS_PROJECT ON workflows(project_id);
    CREATE INDEX IX_WORKFLOWS_STATUS ON workflows(status);
    CREATE INDEX IX_WORKFLOWS_TRIGGER ON workflows(trigger_type, priority DESC);
END;

-- 2. workflow_runs
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'workflow_runs')
BEGIN
    CREATE TABLE workflow_runs (
        id NVARCHAR(64) NOT NULL PRIMARY KEY,
        workflow_id NVARCHAR(64) NOT NULL,
        workflow_version INT NOT NULL DEFAULT 1,
        project_id NVARCHAR(64) NOT NULL,
        phone_number_id NVARCHAR(64) NULL,
        customer_phone NVARCHAR(50) NOT NULL,
        current_node_id NVARCHAR(64) NULL,
        status NVARCHAR(30) NOT NULL DEFAULT 'running', -- 'running' | 'waiting_reply' | 'completed' | 'failed' | 'expired'
        context_json NVARCHAR(MAX) NOT NULL DEFAULT '{}',
        step_count INT NOT NULL DEFAULT 0,
        expires_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_WORKFLOW_RUNS_WORKFLOW ON workflow_runs(workflow_id);
    CREATE INDEX IX_WORKFLOW_RUNS_PROJECT ON workflow_runs(project_id);
    CREATE INDEX IX_WORKFLOW_RUNS_STATUS ON workflow_runs(status);
    CREATE INDEX IX_WORKFLOW_RUNS_CUSTOMER ON workflow_runs(customer_phone, status);
END;

-- 3. workflow_audit_log
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'workflow_audit_log')
BEGIN
    CREATE TABLE workflow_audit_log (
        id NVARCHAR(64) NOT NULL PRIMARY KEY,
        run_id NVARCHAR(64) NOT NULL,
        node_id NVARCHAR(64) NULL,
        event NVARCHAR(50) NOT NULL,
        detail NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_WORKFLOW_AUDIT_RUN ON workflow_audit_log(run_id);
    CREATE INDEX IX_WORKFLOW_AUDIT_EVENT ON workflow_audit_log(event);
END;

-- 4. webhook_allowlist
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'webhook_allowlist')
BEGIN
    CREATE TABLE webhook_allowlist (
        id NVARCHAR(64) NOT NULL PRIMARY KEY,
        project_id NVARCHAR(64) NULL,
        host NVARCHAR(255) NOT NULL,
        created_by NVARCHAR(64) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_WEBHOOK_ALLOWLIST_HOST ON webhook_allowlist(host);
    CREATE INDEX IX_WEBHOOK_ALLOWLIST_PROJ ON webhook_allowlist(project_id);
END;
