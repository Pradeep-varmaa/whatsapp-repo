-- =============================================================================
-- Migration: 006_workflow_engine_and_rbac.sql
-- Description: Workflow Engine, Steps, Saved Actions, Runs, Reply Triggers,
--              Approvals, Outbound Webhook Allowlists, and Token Health Tracking
-- (All foreign keys and restrictive unique constraints removed)
-- =============================================================================

-- 1. Webhook Destination Allowlist (Superadmin managed)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_WEBHOOK_ALLOWLIST')
BEGIN
    CREATE TABLE ENGINE_WEBHOOK_ALLOWLIST (
        allowlist_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        hostname NVARCHAR(255) NOT NULL,
        description NVARCHAR(255) NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_by NVARCHAR(64) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ALLOWLIST_HOST ON ENGINE_WEBHOOK_ALLOWLIST(hostname);
END;

-- 2. Saved Actions (Reusable instances of Action Types)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_SAVED_ACTIONS')
BEGIN
    CREATE TABLE ENGINE_SAVED_ACTIONS (
        action_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        project_id NVARCHAR(64) NULL, -- NULL = global (superadmin), non-null = project-scoped (admin)
        action_type NVARCHAR(50) NOT NULL, -- e.g. whatsapp.send_text, http.webhook
        name NVARCHAR(150) NOT NULL,
        description NVARCHAR(500) NULL,
        config_json NVARCHAR(MAX) NOT NULL DEFAULT '{}',
        created_by NVARCHAR(64) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_SAVED_ACTIONS_PROJECT ON ENGINE_SAVED_ACTIONS(project_id);
    CREATE INDEX IX_SAVED_ACTIONS_TYPE ON ENGINE_SAVED_ACTIONS(action_type);
END;

-- 3. Workflow Flows
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_FLOWS')
BEGIN
    CREATE TABLE ENGINE_FLOWS (
        flow_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        project_id NVARCHAR(64) NOT NULL,
        name NVARCHAR(150) NOT NULL,
        description NVARCHAR(500) NULL,
        status NVARCHAR(30) NOT NULL DEFAULT 'draft', -- draft, active, archived
        requires_approval BIT NOT NULL DEFAULT 0,
        active_version INT NOT NULL DEFAULT 1,
        created_by NVARCHAR(64) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ENGINE_FLOWS_PROJECT ON ENGINE_FLOWS(project_id);
    CREATE INDEX IX_ENGINE_FLOWS_STATUS ON ENGINE_FLOWS(status);
END;

-- 4. Workflow Versions (Append-only on edits)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_FLOW_VERSIONS')
BEGIN
    CREATE TABLE ENGINE_FLOW_VERSIONS (
        version_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        flow_id NVARCHAR(64) NOT NULL,
        version_number INT NOT NULL,
        definition_json NVARCHAR(MAX) NOT NULL, -- Steps array, branches, retry rules
        created_by NVARCHAR(64) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_FLOW_VERSIONS_FLOW ON ENGINE_FLOW_VERSIONS(flow_id);
    CREATE INDEX IX_FLOW_VERSIONS_NUM ON ENGINE_FLOW_VERSIONS(flow_id, version_number);
END;

-- 5. Flow Runs (Execution instances)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_FLOW_RUNS')
BEGIN
    CREATE TABLE ENGINE_FLOW_RUNS (
        run_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        flow_id NVARCHAR(64) NOT NULL,
        version_id NVARCHAR(64) NOT NULL,
        project_id NVARCHAR(64) NOT NULL,
        triggered_by NVARCHAR(64) NOT NULL, -- user_id or 'trigger:reply'
        status NVARCHAR(30) NOT NULL DEFAULT 'queued', -- pending_approval, queued, running, waiting, completed, failed, cancelled
        input_json NVARCHAR(MAX) NOT NULL DEFAULT '{}',
        variables_json NVARCHAR(MAX) NOT NULL DEFAULT '{}',
        current_step_index INT NOT NULL DEFAULT 0,
        step_execution_count INT NOT NULL DEFAULT 0, -- Loop guard counter
        waiting_for_reply BIT NOT NULL DEFAULT 0,
        waiting_customer_phone NVARCHAR(50) NULL,
        last_error_code NVARCHAR(50) NULL,
        last_error_message NVARCHAR(MAX) NULL,
        claimed_at DATETIME2 NULL,
        completed_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_FLOW_RUNS_STATUS ON ENGINE_FLOW_RUNS(status);
    CREATE INDEX IX_FLOW_RUNS_PROJECT ON ENGINE_FLOW_RUNS(project_id);
    CREATE INDEX IX_FLOW_RUNS_WAITING ON ENGINE_FLOW_RUNS(waiting_for_reply, waiting_customer_phone);
END;

-- 6. Flow Run Step Execution Logs
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_RUN_STEPS')
BEGIN
    CREATE TABLE ENGINE_RUN_STEPS (
        step_run_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        run_id NVARCHAR(64) NOT NULL,
        step_id NVARCHAR(64) NOT NULL,
        action_type NVARCHAR(50) NOT NULL,
        status NVARCHAR(30) NOT NULL, -- completed, failed, skipped
        input_snapshot_json NVARCHAR(MAX) NULL,
        output_result_json NVARCHAR(MAX) NULL,
        idempotency_key NVARCHAR(128) NULL,
        error_code NVARCHAR(50) NULL,
        error_message NVARCHAR(MAX) NULL,
        duration_ms INT NULL,
        executed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_RUN_STEPS_RUN ON ENGINE_RUN_STEPS(run_id);
END;

-- 7. Reply Trigger Rules
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_REPLY_TRIGGERS')
BEGIN
    CREATE TABLE ENGINE_REPLY_TRIGGERS (
        trigger_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        project_id NVARCHAR(64) NOT NULL,
        flow_id NVARCHAR(64) NOT NULL,
        trigger_type NVARCHAR(30) NOT NULL, -- 'keyword_exact', 'keyword_contains', 'reply_within_24h', 'fallback'
        keyword NVARCHAR(150) NULL,
        priority INT NOT NULL DEFAULT 100, -- lower number = higher priority
        rate_limit_per_customer_per_hour INT NOT NULL DEFAULT 10,
        is_active BIT NOT NULL DEFAULT 1,
        created_by NVARCHAR(64) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_TRIGGERS_PROJECT ON ENGINE_REPLY_TRIGGERS(project_id, is_active);
END;

-- 8. Run Approvals
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ENGINE_RUN_APPROVALS')
BEGIN
    CREATE TABLE ENGINE_RUN_APPROVALS (
        approval_id NVARCHAR(64) NOT NULL PRIMARY KEY,
        run_id NVARCHAR(64) NOT NULL,
        project_id NVARCHAR(64) NOT NULL,
        requested_by NVARCHAR(64) NOT NULL,
        status NVARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
        reviewed_by NVARCHAR(64) NULL,
        review_note NVARCHAR(500) NULL,
        reviewed_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_APPROVALS_RUN ON ENGINE_RUN_APPROVALS(run_id);
    CREATE INDEX IX_APPROVALS_STATUS ON ENGINE_RUN_APPROVALS(status);
END;
