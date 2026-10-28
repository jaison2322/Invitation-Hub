# Invitation Hub — Database Rebuild Proposal (Phase C — Hardened & Reviewed)

## 1. Overview & Architecture Context

This directory contains the complete, hardened, and reviewed database rebuild specification for **Invitation Hub** (VIP Scheduling & Event Intelligence).

- **Frontend:** React + TypeScript (Vite + Capacitor)
- **Backend:** Supabase (PostgreSQL 15+, RLS, Security Definer RPCs, Realtime, Storage)
- **Push Notifications:** Firebase Cloud Messaging (FCM) v1
- **Target Staging Environment:** Project `kdbkfmzsdinkvslvgson` (`https://kdbkfmzsdinkvslvgson.supabase.co`)
- **Production Reference:** `lliowikzustvebudgsoy` (**STRICTLY OFF-LIMITS — ZERO WRITES OR SCHEMA MODIFICATIONS PERMITTED**)

---

## 2. Security Vulnerabilities & Findings Resolved

The rebuild suite addresses all vulnerabilities identified during architectural review:

| Finding ID | Severity | Defect Description | Root Cause | Hardened Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01 / P1** | High | Credential & Info Exfiltration in `lookup_user_account` | Returned `SELECT *` from `user_accounts`, exposing `password_hash`, `auth_token`, and `pin` | [`02_auth_and_identity.sql`](file:///d:/ELITE%20PROJECT%20-%201/database/rebuild-proposal/02_auth_and_identity.sql): Strips password hash, auth token, and PIN. Restricts search to exact username or exact email (eliminates loose phone/name enumeration). Redacts contact info for unauthenticated callers. |
| **SEC-02 / P1** | Critical | Unauthenticated Session Hijacking in `update_user_auth_token` | Any caller could set arbitrary auth tokens on any user account | [`02_auth_and_identity.sql`](file:///d:/ELITE%20PROJECT%20-%201/database/rebuild-proposal/02_auth_and_identity.sql): Enforces strict authorization. Requires caller to have an active verified session matching the user OR present the user's verified SHA-256 password hash. |
| **SEC-03 / P0** | Critical | Caller Tenant Spoofing & Unauthorized Staff Reassignment | `respond_to_staff_request`, `get_vip_staff_accounts`, and `reassign_staff_vip` trusted caller input | [`04_staff_approval_workflow.sql`](file:///d:/ELITE%20PROJECT%20-%201/database/rebuild-proposal/04_staff_approval_workflow.sql): Strips caller-supplied VIP parameters. Derives tenant context strictly from verified session (`get_auth_identity()`). In `reassign_staff_vip`, requires caller to be an approved VIP principal who owns the staff account; cross-tenant reassignment attempts are rejected without mutating data. |
| **P0 Finding** | Critical | Staff Account Takeover during Registration | `submit_staff_registration_request` allowed any unauthenticated caller to overwrite pending/rejected accounts | [`04_staff_approval_workflow.sql`](file:///d:/ELITE%20PROJECT%20-%201/database/rebuild-proposal/04_staff_approval_workflow.sql): If an account exists in pending/rejected status, caller MUST supply the matching existing password hash to update application details. Unauthenticated attackers cannot hijack or alter accounts. |
| **SEC-04 / P1** | High | Insecure Storage Access with Public Fallback | Storage policy contained `OR public.get_auth_vip_id() IS NULL`, granting public access to invitations | [`06_storage_policies.sql`](file:///d:/ELITE%20PROJECT%20-%201/database/rebuild-proposal/06_storage_policies.sql): Removes public fallback. Reconciles Storage identity checks with `get_auth_vip_id()` (`x-vip-id` and `x-user-token` custom headers). Bucket `'invitations'` is strictly private. |
| **P1 Finding** | Medium | Unsafe Phone Verification Mutation | `verify_staff_phone` allowed unauthenticated callers to alter phone numbers and set `phone_verified = true` | [`04_staff_approval_workflow.sql`](file:///d:/ELITE%20PROJECT%20-%201/database/rebuild-proposal/04_staff_approval_workflow.sql): Converted to a strictly NON-MUTATING compatibility stub. Performs zero database writes. Execution revoked from `PUBLIC`. |
| **P1 Finding** | High | Cross-Tenant Referential Integrity Defect | Foreign keys only referenced `id`, allowing a VIP's records to reference another VIP's people | [`01_core_tables_and_constraints.sql`](file:///d:/ELITE%20PROJECT%20-%201/database/rebuild-proposal/01_core_tables_and_constraints.sql): Implements composite unique tenant constraints (`uq_*_tenant`) and composite foreign keys (`FOREIGN KEY (person_id, vip_id) REFERENCES people(id, vip_id)`). Mathematically prevents cross-tenant references at the engine level. |
| **P1 Finding** | Critical | Unreliable Environment Preflight Guard | Guard relied on `current_database()` containing the project reference (in Supabase, DB is usually named `'postgres'`) | [`00_preflight_guard.sql`](file:///d:/ELITE%20PROJECT%20-%201/database/rebuild-proposal/00_preflight_guard.sql): Implements fail-closed verification. Requires explicit session parameter `SET app.settings.expected_project_ref = 'kdbkfmzsdinkvslvgson'`. Aborts immediately if missing, mismatched, or if production reference `lliowikzustvebudgsoy` is detected. |

---

## 3. Application Schema Investigation: `people` Table Contract

The security review requested specific investigation of potential missing fields on `people`: `organization`, `category`, `importance_score`, and `tags`.

**Investigation Findings:**
1. Inspected TypeScript definition `interface Person` in [`src/types/index.ts`](file:///d:/ELITE%20PROJECT%20-%201/src/types/index.ts#L135-L146):
   - Defined fields: `id, vipId, name, nickname, relationship, phone, email, notes, createdAt, updatedAt`.
   - Fields `organization`, `category`, `importance_score`, and `tags` **DO NOT EXIST** in the TypeScript interface.
2. Inspected service layer [`src/services/supabaseDbService.ts`](file:///d:/ELITE%20PROJECT%20-%201/src/services/supabaseDbService.ts#L20-L70):
   - `getPeople()` and `insertPerson()` map exclusively to: `id, vip_id, name, nickname, relationship, phone, email, notes, created_at, updated_at`.
3. **Conclusion:** Adding `organization`, `category`, `importance_score`, and `tags` would violate the existing application contract and introduce unused columns. Consequently, [`01_core_tables_and_constraints.sql`](file:///d:/ELITE%20PROJECT%20-%201/database/rebuild-proposal/01_core_tables_and_constraints.sql) retains the exact application-verified schema while adding composite tenant integrity (`CONSTRAINT uq_people_tenant UNIQUE (id, vip_id)`).

---

## 4. Frontend Compatibility Analysis & Documentation

The security fixes maintain backward compatibility wherever possible. Two critical architectural patterns in the existing client code require documentation:

### 1. Password Verification Flow (`lookup_user_account` & `update_user_auth_token`)
- **Existing Client Behavior:** In `src/store/useAppStore.ts` (lines 640–645), client-side code previously fetched the user's account via `lookup_user_account`, compared `dbAccount.passwordHash === passwordHash` locally in JavaScript, and then invoked `update_user_auth_token(username, authToken)` without sending the password to the server.
- **Security Requirement:** Storing or transmitting password hashes to anonymous callers violates basic credential security (**SEC-01**). `lookup_user_account` must never disclose password hashes.
- **Server-Side Hardening:** `update_user_auth_token` now accepts optional `p_password_hash`. When an unauthenticated client initiates a session, supplying `p_password_hash` allows the database to verify the password securely.
- **Recommended Client Update (Future Phase):** Update `supabaseDbService.updateUserAuthToken` to pass `p_password_hash: passwordHash`, delegating credential verification completely to the PostgreSQL engine.

### 2. Staff Reassignment Authority (`reassign_staff_vip`)
- **Existing Client Behavior:** In `src/routes/ApprovalRejectedScreen.tsx`, rejected staff could trigger `reassignStaffVipRequest` directly.
- **Security Requirement:** Allowing unauthenticated or rejected callers to arbitrarily reassign accounts across VIP tenants enabled cross-tenant staff hijacking (**P0**).
- **Server-Side Hardening:** `reassign_staff_vip` now requires an active session from the staff member's current VIP Principal (`role = 'vip'`). A VIP from another tenant cannot hijack or reassign another VIP's staff.
- **Recommended Client Update (Future Phase):** If rejected staff need to self-request a new VIP after rejection, introduce a dedicated `request_vip_transfer` RPC that validates the staff user's own password hash during the request.

---

## 5. Storage Policy Reconciliation

Supabase Storage API requests in Invitation Hub are wrapped by `authenticatedFetch` in [`src/utils/supabase.ts`](file:///d:/ELITE%20PROJECT%20-%201/src/utils/supabase.ts):
- Every storage request sends custom HTTP headers `x-vip-id` and `x-user-token`.
- Storage policies in [`06_storage_policies.sql`](file:///d:/ELITE%20PROJECT%20-%201/database/rebuild-proposal/06_storage_policies.sql) do **NOT** rely on Supabase GoTrue JWTs (`auth.role() = 'authenticated'`).
- Instead, policies invoke `public.get_auth_vip_id()`, which validates the `x-vip-id` and `x-user-token` headers directly against `user_accounts`.
- The storage path format is `{vip_id}/{eventId}/invitation_{timestamp}_{random}.{ext}`.
- RLS asserts that the first folder component `(storage.foldername(name))[1]` matches `public.get_auth_vip_id()`.
- Unauthenticated access and cross-tenant access are strictly blocked.

---

## 6. Migration Sequence & File Inventory

The migration files must be executed in topological sequence:

```
database/rebuild-proposal/
├── 00_preflight_guard.sql             -- Fail-closed environment guard & extensions
├── 01_core_tables_and_constraints.sql   -- 11 core tables with composite tenant FKs
├── 02_auth_and_identity.sql           -- Session validation, get_auth_*, and sanitized lookup RPC
├── 03_rls_and_tenant_isolation.sql    -- Strict RLS policies across all 11 tables
├── 04_staff_approval_workflow.sql     -- Takeover-protected staff workflow RPCs & non-mutating phone stub
├── 05_device_tokens_and_push.sql      -- Concurrency-hardened FCM device token registration
├── 06_storage_policies.sql            -- Private 'invitations' bucket & tenant-isolated storage RLS
├── 07_realtime_setup.sql              -- Replica identity FULL & supabase_realtime publication
├── 99_test_validation_suite.sql       -- 10-point dry-run diagnostic test (ROLLBACK-guaranteed)
├── README.md                          -- This architectural & operational specification
└── VALIDATION_PLAN.md                 -- Formal test matrix & verification criteria
```

---

## 7. Operator Staging Execution Guide (Phase D)

> [!CAUTION]
> **STAGING ONLY:** Execute these steps ONLY against staging project `kdbkfmzsdinkvslvgson`. NEVER execute against production `lliowikzustvebudgsoy`.

### Preflight Setup (Defense-in-Depth Guard)
The preflight guard requires explicit confirmation of the staging target. In the Supabase SQL Editor for Staging (`kdbkfmzsdinkvslvgson`), execute the migration steps in order:

1. **Step 0: Preflight Guard**
   ```sql
   SET app.settings.expected_project_ref = 'kdbkfmzsdinkvslvgson';
   -- Paste contents of 00_preflight_guard.sql
   ```
   *Verify:* Output displays `PREFLIGHT GUARD PASSED: Positively verified staging environment ("kdbkfmzsdinkvslvgson").`

2. **Step 1: Core Tables & Composite Constraints**
   - Execute `01_core_tables_and_constraints.sql`.
   - *Verify:* 11 tables created with composite unique and foreign key constraints.

3. **Step 2: Auth & Identity Infrastructure**
   - Execute `02_auth_and_identity.sql`.
   - *Verify:* Functions `get_auth_identity`, `get_auth_vip_id`, `lookup_user_account`, `update_user_auth_token` created.

4. **Step 3: RLS & Tenant Isolation**
   - Execute `03_rls_and_tenant_isolation.sql`.
   - *Verify:* RLS enabled on all 11 tables; direct table writes on `device_tokens` revoked.

5. **Step 4: Staff Approval Lifecycle**
   - Execute `04_staff_approval_workflow.sql`.
   - *Verify:* `submit_staff_registration_request`, `respond_to_staff_request`, `reassign_staff_vip` created.

6. **Step 5: FCM Device Tokens**
   - Execute `05_device_tokens_and_push.sql`.
   - *Verify:* `register_device_token` with $L_1/L_2$ advisory locks created.

7. **Step 6: Storage Policies**
   - Execute `06_storage_policies.sql`.
   - *Verify:* Private `'invitations'` bucket and RLS policies configured.

8. **Step 7: Realtime Publication**
   - Execute `07_realtime_setup.sql`.
   - *Verify:* `REPLICA IDENTITY FULL` set and all 10 tenant tables added to `supabase_realtime`.

9. **Step 8: Diagnostic Smoke Test**
   - Execute `99_test_validation_suite.sql`.
   - *Verify:* All 10 assertion blocks pass and the script ends with `ROLLBACK;`.
