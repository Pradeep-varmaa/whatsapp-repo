-- =============================================================================
-- Migration: 010_restore_constraints_and_campaigns.sql
-- Description: Adds performance/idempotency indexes and Broadcast Campaigns tables.
-- =============================================================================

-- 1. Ensure unique active workflow run per customer/project/phone where missing
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_WORKFLOW_RUNS_ACTIVE_LOOKUP' AND object_id = OBJECT_ID('workflow_runs'))
BEGIN
    CREATE INDEX IX_WORKFLOW_RUNS_ACTIVE_LOOKUP
    ON workflow_runs(project_id, customer_phone, status)
    INCLUDE (workflow_id, current_node_id, updated_at);
END;

-- 2. Broadcast Campaigns table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'campaigns')
BEGIN
    CREATE TABLE campaigns (
        id NVARCHAR(64) NOT NULL PRIMARY KEY,
        project_id NVARCHAR(64) NOT NULL,
        phone_number_id NVARCHAR(64) NOT NULL,
        name NVARCHAR(150) NOT NULL,
        template_name NVARCHAR(150) NOT NULL,
        template_language NVARCHAR(20) NOT NULL DEFAULT 'en_US',
        status NVARCHAR(30) NOT NULL DEFAULT 'draft', -- 'draft' | 'scheduled' | 'running' | 'completed' | 'paused' | 'failed'
        total_recipients INT NOT NULL DEFAULT 0,
        sent_count INT NOT NULL DEFAULT 0,
        delivered_count INT NOT NULL DEFAULT 0,
        failed_count INT NOT NULL DEFAULT 0,
        rate_limit_mps INT NOT NULL DEFAULT 10,
        scheduled_at DATETIME2 NULL,
        started_at DATETIME2 NULL,
        completed_at DATETIME2 NULL,
        created_by NVARCHAR(64) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_CAMPAIGNS_PROJECT ON campaigns(project_id, created_at DESC);
    CREATE INDEX IX_CAMPAIGNS_STATUS ON campaigns(status);
END;

-- 3. Campaign Recipients table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'campaign_recipients')
BEGIN
    CREATE TABLE campaign_recipients (
        id NVARCHAR(64) NOT NULL PRIMARY KEY,
        campaign_id NVARCHAR(64) NOT NULL,
        recipient_phone NVARCHAR(50) NOT NULL,
        variables_json NVARCHAR(MAX) NULL,
        status NVARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending' | 'queued' | 'sent' | 'delivered' | 'failed'
        message_id NVARCHAR(64) NULL,
        error_message NVARCHAR(500) NULL,
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_CAMPAIGN_RECIPIENTS_CAMPAIGN ON campaign_recipients(campaign_id, status);
END;
