-- =============================================================================
-- Migration: 009_drop_all_constraints.sql (DISABLED FOR SAFETY)
-- Description: Previously dropped all FK, UQ, and unique indexes dynamically.
--              Disabled so `npm run db:migrate` does not destroy referential
--              integrity or idempotency constraints.
-- =============================================================================
SET NOCOUNT ON;
PRINT '009_drop_all_constraints.sql is disabled to preserve data integrity and idempotency.';
