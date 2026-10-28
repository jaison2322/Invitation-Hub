-- ==============================================================================
-- 00_preflight_guard.sql
-- Invitation Hub Secure Database Rebuild — Migration Step 00
-- Purpose: Reliable environment safety assertions (fail-closed) & PostgreSQL extensions.
-- Target Environment: Staging ONLY (project ref: kdbkfmzsdinkvslvgson)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. HARD SAFETY ASSERTION: Fail-Closed Environment Guard
-- ------------------------------------------------------------------------------
-- Defense-in-depth preflight check.
-- Rules:
-- 1. Does NOT rely on `current_database()` containing a Supabase project reference,
--    because Supabase hosted databases are typically named 'postgres'.
-- 2. Requires an explicitly configured session variable `app.settings.expected_project_ref`
--    matching the target staging project reference ('kdbkfmzsdinkvslvgson').
-- 3. FAILS CLOSED (raises exception) if the configuration is missing, empty, or mismatched.
-- 4. HARD-BLOCKS any execution matching production project reference ('lliowikzustvebudgsoy').
--
-- OPERATOR INSTRUCTION:
-- Before running this migration suite on Staging, execute:
--   SET app.settings.expected_project_ref = 'kdbkfmzsdinkvslvgson';
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_expected_staging_ref CONSTANT text := 'kdbkfmzsdinkvslvgson';
  v_production_ref CONSTANT text := 'lliowikzustvebudgsoy';
  v_configured_ref text;
  v_current_db text := current_database();
  v_server_addr text;
BEGIN
  -- 1. Extract explicitly configured project reference
  BEGIN
    v_configured_ref := NULLIF(trim(current_setting('app.settings.expected_project_ref', true)), '');
  EXCEPTION WHEN OTHERS THEN
    v_configured_ref := NULL;
  END;

  -- 2. Check for any production indicators
  IF v_configured_ref = v_production_ref THEN
    RAISE EXCEPTION 'FATAL SECURITY VIOLATION: Explicit project reference matches PRODUCTION ("%"). Execution is strictly blocked!', v_production_ref;
  END IF;

  IF v_current_db ILIKE '%' || v_production_ref || '%' THEN
    RAISE EXCEPTION 'FATAL SECURITY VIOLATION: Database name matches PRODUCTION reference ("%"). Execution is strictly blocked!', v_production_ref;
  END IF;

  -- 3. FAIL-CLOSED: Positively verify the target environment is explicitly confirmed staging
  IF v_configured_ref IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT GUARD HALTED (FAIL-CLOSED): Missing target environment verification. '
      'To prevent accidental execution on production, you must explicitly confirm the target staging reference '
      'before running this script by executing: SET app.settings.expected_project_ref = ''kdbkfmzsdinkvslvgson'';';
  END IF;

  IF v_configured_ref <> v_expected_staging_ref THEN
    RAISE EXCEPTION 'PREFLIGHT GUARD HALTED: Configured project reference ("%") does not match expected staging reference ("%"). Aborting execution.',
      v_configured_ref, v_expected_staging_ref;
  END IF;

  RAISE NOTICE 'PREFLIGHT GUARD PASSED: Positively verified staging environment ("%"). Non-production confirmed.', v_configured_ref;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. MANDATORY EXTENSIONS
-- ------------------------------------------------------------------------------
-- uuid-ossp: Used for standard UUID generation (e.g. device_tokens.id)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto: Used for secure random tokens and cryptographic hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Optional pg_net: Used for asynchronous Edge Function invocation
-- Enabled conditionally; does not fail if network extensions are restricted
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS "pg_net";
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_net extension not available or restricted in this environment. Direct client Edge Function invocation will serve as primary push dispatch.';
  END;
END;
$$;

COMMIT;
