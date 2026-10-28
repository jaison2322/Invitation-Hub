# Invitation Hub — Validation & Verification Plan (Phase C — Hardened)

## Purpose & Scope

This document defines the formal validation suite to verify the security, integrity, and frontend contract compatibility of the rebuilt database schema before production deployment.

- **Target Staging Environment:** `kdbkfmzsdinkvslvgson` (`https://kdbkfmzsdinkvslvgson.supabase.co`)
- **Production Reference:** `lliowikzustvebudgsoy` (**STRICTLY OFF-LIMITS**)

> [!NOTE]
> **Static Review vs. Live Database Tests:**
> - **Category A (Static / Code Review):** Verified by inspecting SQL definitions, schemas, policies, and privileges prior to execution.
> - **Category B (Dry-Run Staging Smoke Tests):** Verified non-destructively on Staging using `99_test_validation_suite.sql` inside a transaction that terminates with `ROLLBACK;` (leaves zero persistent data).
> - **Category C (Stateful Staging Integration Tests):** Verified after Phase D approval on the isolated Staging database with persistent synthetic fixtures and client integration.

---

## Part 1: Security Test Cases (SEC-TC)

### SEC-TC-01: Strict Cross-Tenant Isolation (RLS)
- **Category:** Category B & C
- **Objective:** Verify that an authenticated user belonging to Tenant A (`vip_id_A`) cannot read, insert, update, or delete records belonging to Tenant B (`vip_id_B`) across all tenant tables.
- **Tables Tested:** `people`, `invitations`, `family_events`, `schedule_items`, `reminders`, `activity_logs`, `notifications`, `gift_records`, `user_accounts`, `device_tokens`.
- **Methodology:**
  1. Set request headers: `x-vip-id = 'vip_tenant_alpha'`, `x-user-token = 'token_alpha'`.
  2. Attempt to `SELECT * FROM people WHERE vip_id = 'vip_tenant_beta'`.
  3. Attempt to `INSERT INTO people (id, vip_id, name, relationship) VALUES ('hack_1', 'vip_tenant_beta', 'Hacker', 'Friend')`.
  4. Attempt to `UPDATE people SET name = 'Hacked' WHERE vip_id = 'vip_tenant_beta'`.
  5. Attempt to `DELETE FROM people WHERE vip_id = 'vip_tenant_beta'`.
- **Expected Result:**
  - `SELECT` returns 0 rows.
  - `INSERT` fails with RLS policy check violation (`new row violates row-level security policy`).
  - `UPDATE` and `DELETE` affect 0 rows.

### SEC-TC-02: Staff Approval Lifecycle & Authorization Boundary
- **Category:** Category B & C
- **Objective:** Verify that a staff user with `approval_status = 'PENDING_APPROVAL'` or `'REJECTED'` is completely blocked from accessing tenant data until approved by the VIP principal.
- **Methodology:**
  1. Register a new staff user via `submit_staff_registration_request`. Status is initialized to `PENDING_APPROVAL`.
  2. Attempt to invoke `get_auth_identity()` with this staff user's credentials.
  3. Attempt direct table queries on `invitations`, `people`, and `reminders` with the pending staff headers.
  4. Approve the staff user via `respond_to_staff_request(p_staff_username, true)` from the VIP principal session.
  5. Repeat queries with approved staff headers.
- **Expected Result:**
  - In `PENDING_APPROVAL` state: `get_auth_identity()` returns `NULL, NULL`. Queries return 0 rows.
  - In `REJECTED` state: `get_auth_identity()` returns `NULL, NULL`. Queries return 0 rows.
  - In `APPROVED` state: `get_auth_identity()` returns verified username and `vip_id`. Queries successfully return the VIP's records.

### SEC-TC-03: Prevention of Caller VIP Spoofing (Fixes SEC-03)
- **Category:** Category B & C
- **Objective:** Verify that a caller cannot approve staff, reject staff, or list staff members for a VIP tenant they do not own.
- **Methodology:**
  1. Authenticate as VIP Principal A (`vip_tenant_alpha`).
  2. Staff user Bob applied to VIP Tenant B (`vip_tenant_beta`).
  3. VIP Principal A calls `respond_to_staff_request(p_staff_username := 'bob', p_accept := true)`.
  4. VIP Principal A calls `get_vip_staff_accounts()`.
- **Expected Result:**
  - `respond_to_staff_request` returns `{"success": false, "code": "NOT_FOUND", "error": "Staff request account not found for this VIP tenant"}`.
  - `get_vip_staff_accounts()` returns ONLY staff registered under `vip_tenant_alpha`. Zero staff from `vip_tenant_beta` are returned.

### SEC-TC-04: Prevention of Credential Exfiltration (Fixes SEC-01 & Limits Disclosure)
- **Category:** Category A & B
- **Objective:** Verify that `lookup_user_account` does not disclose sensitive authentication credentials (`password_hash`, `auth_token`, `pin`) or allow loose user enumeration.
- **Methodology:**
  1. Query `lookup_user_account('tenant_alpha')` as an unauthenticated caller (`anon`).
  2. Inspect returned fields.
  3. Attempt loose enumeration by querying phone number `lookup_user_account('+15550000001')`.
- **Expected Result:**
  - `password_hash`, `auth_token`, and `pin` are completely absent from the returned columns.
  - Unauthenticated caller receives `phone: NULL` and `email: NULL`.
  - Phone-based query returns 0 rows (only exact username or exact email matches are resolved).

### SEC-TC-05: Prevention of Session Hijacking via Auth Token (Fixes SEC-02)
- **Category:** Category A & B
- **Objective:** Verify that arbitrary callers cannot overwrite auth tokens on user accounts.
- **Methodology:**
  1. Without setting any session headers and without providing `p_password_hash`, call `update_user_auth_token('victim_user', 'malicious_token')`.
  2. Call `update_user_auth_token('victim_user', 'malicious_token', NULL, 'wrong_hash')`.
  3. Call `update_user_auth_token('victim_user', 'valid_token', NULL, '<actual_sha256_hash>')`.
- **Expected Result:**
  - Calls 1 and 2 return `{"success": false, "code": "UNAUTHORIZED"}` or `{"code": "INVALID_CREDENTIALS"}`.
  - Call 3 succeeds and returns `{"success": true}`.

### SEC-TC-06: Direct REST/SQL Write Denial on Device Tokens
- **Category:** Category A & B
- **Objective:** Verify that clients cannot insert, update, or delete rows in `device_tokens` directly via PostgREST, and must use hardened RPCs.
- **Methodology:**
  1. Connect with `anon` and `authenticated` roles.
  2. Attempt `INSERT INTO device_tokens (fcm_token, vip_id, username) VALUES ('token_1', 'vip_tenant_alpha', 'tenant_alpha')`.
  3. Attempt `UPDATE device_tokens SET is_active = false`.
  4. Attempt `DELETE FROM device_tokens`.
- **Expected Result:**
  - All direct mutation attempts fail with `ERROR: permission denied for table device_tokens`.

### SEC-TC-07: Concurrency & Advisory Lock Serialization on Device Tokens
- **Category:** Category B & C
- **Objective:** Verify that concurrent registrations of identical FCM tokens do not produce race conditions, duplicate key violations, or unauthorized ownership transfers.
- **Methodology:**
  1. Register `token_alpha` under `user_1` via `register_device_token`.
  2. Attempt to register `token_alpha` under `user_2` without deactivating it.
  3. Deactivate `token_alpha` via `deactivate_device_token('token_alpha')`.
  4. Register `token_alpha` under `user_2`.
  5. Concurrently fire 5 identical registration calls for `user_2` with `token_alpha`.
- **Expected Result:**
  - Step 1: `success = true`.
  - Step 2: Fails with `code = 'TOKEN_OWNERSHIP_CONFLICT'`.
  - Step 3: `success = true`.
  - Step 4: `success = true`.
  - Step 5: All 5 calls succeed cleanly due to $L_1/L_2$ advisory locks; exactly 1 active row exists in `device_tokens`.

### SEC-TC-08: Storage Tenant Isolation & No Public Fallback (Fixes SEC-04)
- **Category:** Category A & C
- **Objective:** Verify that invitation images in storage cannot be uploaded, read, or deleted across VIP tenants, and that unauthenticated public access is denied.
- **Methodology:**
  1. Attempt to upload a file to `invitations/anonymous_file.png` without session headers.
  2. Authenticate as VIP Alpha (`vip_tenant_alpha`). Upload to `invitations/vip_tenant_alpha/event_1/flyer.jpg`.
  3. Attempt to read or generate a signed URL for `invitations/vip_tenant_alpha/event_1/flyer.jpg` using VIP Beta session headers.
- **Expected Result:**
  - Step 1: Fails with storage RLS unauthorized error.
  - Step 2: Upload succeeds.
  - Step 3: Access denied (0 bytes returned or 403 Forbidden).

### SEC-TC-09: Complete SMS / Phone OTP Elimination
- **Category:** Category A & B
- **Objective:** Verify that phone verification does not require SMS or external gateways, and registration completes with `phone_verified = true`.
- **Methodology:**
  1. Call `submit_staff_registration_request` with sample phone `+15555551234`.
  2. Inspect created row in `user_accounts`.
  3. Call `verify_staff_phone(p_staff_username := 'teststaff', p_otp := '123456')`.
- **Expected Result:**
  - `user_accounts.phone_verified` is immediately `true`.
  - `verify_staff_phone` returns `{"success": true, "phone_verified": true}`.

### SEC-TC-10: Unauthorized Staff Reassignment Prevention (P0 Finding)
- **Category:** Category B & C
- **Objective:** Verify that a caller cannot reassign arbitrary staff accounts between VIP tenants without verified ownership.
- **Methodology:**
  1. Authenticate as VIP Beta (`vip_tenant_beta`).
  2. Staff member Alice belongs to VIP Alpha (`vip_tenant_alpha`).
  3. VIP Beta calls `reassign_staff_vip('alice', 'tenant_beta')`.
  4. Inspect Alice's account in `user_accounts`.
- **Expected Result:**
  - `reassign_staff_vip` returns `{"success": false, "code": "CROSS_TENANT_FORBIDDEN"}`.
  - Alice's `vip_id` remains `vip_tenant_alpha` (zero data modified).

### SEC-TC-11: Staff Account Takeover Prevention during Registration (P0 Finding)
- **Category:** Category B & C
- **Objective:** Verify that an unauthenticated caller cannot overwrite credentials or personal details of an existing pending or rejected staff account merely by submitting a registration with its username.
- **Methodology:**
  1. Alice registers as staff under username `alice_pa` with password hash `hash_alice`.
  2. Attacker submits `submit_staff_registration_request` for username `alice_pa` with `hash_attacker`.
  3. Inspect `user_accounts.password_hash` for `alice_pa`.
  4. Alice re-submits `submit_staff_registration_request` supplying her original `hash_alice`.
- **Expected Result:**
  - Step 2: Fails with `code = 'ACCOUNT_TAKEOVER_PREVENTED'`.
  - Step 3: `password_hash` remains `hash_alice`. Attacker could not overwrite credentials or retarget VIP.
  - Step 4: Succeeds and updates application.

### SEC-TC-12: Composite Tenant Constraint Enforcement (P1 Finding)
- **Category:** Category B & C
- **Objective:** Verify that composite foreign key constraints prevent records from referencing another VIP's entities (people, invitations, events).
- **Methodology:**
  1. Create Person A under `vip_tenant_alpha`.
  2. Attempt to insert Invitation B under `vip_tenant_beta` with `person_id = Person A`.
- **Expected Result:**
  - Database rejects the insert with `foreign_key_violation` on constraint `fk_invitations_person`.

### SEC-TC-13: Non-Mutating Phone Verification Guarantee (P1 Finding)
- **Category:** Category B & C
- **Objective:** Verify that `verify_staff_phone` does not modify user phone numbers or execute database mutations.
- **Methodology:**
  1. Note original phone number on `tenant_alpha`.
  2. Call `verify_staff_phone('tenant_alpha', '999999', '+19998887777')`.
  3. Query `user_accounts.phone` for `tenant_alpha`.
- **Expected Result:**
  - Phone number is completely unchanged (`+15550000001`). Zero database writes occurred.

### SEC-TC-14: Fail-Closed Environment Guard Assertion (P1 Finding)
- **Category:** Category A & B
- **Objective:** Verify that `00_preflight_guard.sql` fails closed if the target environment is not positively confirmed as staging, and aborts if production reference `lliowikzustvebudgsoy` is detected.
- **Methodology:**
  1. Run guard without setting `app.settings.expected_project_ref`.
  2. Run guard with `SET app.settings.expected_project_ref = 'lliowikzustvebudgsoy'`.
- **Expected Result:**
  - Case 1: Throws `PREFLIGHT GUARD HALTED (FAIL-CLOSED): Missing target environment verification`.
  - Case 2: Throws `FATAL SECURITY VIOLATION: Explicit project reference matches PRODUCTION`.

---

## Part 2: Frontend Feature Contract Test Cases (FC-TC)

All 14 active frontend capabilities must remain 100% operational against the rebuilt database:

| Feature Contract ID | Application Feature | Service Method in `supabaseDbService.ts` | Verification Criteria |
| :--- | :--- | :--- | :--- |
| **FC-01** | **VIP Contact Roster** | `getPeople()`, `createPerson()`, `updatePerson()`, `deletePerson()` | Supports `name`, `nickname`, `relationship`, `phone`, `email`, and `notes`. Tenant-scoped to active VIP. |
| **FC-02** | **Invitations Management** | `getInvitations()`, `createInvitation()`, `updateInvitation()`, `deleteInvitation()` | Full lifecycle: dates, venues, host details, priority, RSVP status (`'pending'`, `'confirmed'`, `'ignored'`), image attachments. |
| **FC-03** | **Family Events** | `getFamilyEvents()`, `createFamilyEvent()`, `updateFamilyEvent()`, `deleteFamilyEvent()` | Supports title, dates, recurrence rules, family member, and guests. Filtered by active VIP. |
| **FC-04** | **Schedule Items** | `getScheduleItems()`, `createScheduleItem()`, `updateScheduleItem()`, `deleteScheduleItem()` | Day/week schedule items, start/end timestamps, location, and notes. Scoped to active VIP. |
| **FC-05** | **Reminders & Tasks** | `getReminders()`, `createReminder()`, `updateReminder()`, `deleteReminder()` | Due dates, priority ratings, days before event, unread filtering. Filtered by active VIP. |
| **FC-06** | **In-App Notifications** | `getNotifications()`, `markNotificationAsRead()`, `clearAllNotifications()` | Type categorizations (`'change_alert'`, `'new_invitation'`, `'staff_request'`), read status timestamps, tenant scoping. |
| **FC-07** | **Audit Activity Logs** | `getActivityLogs()`, `logActivity()` | Timestamped audit records for actions, entity types, entity names, and user identifiers. |
| **FC-08** | **VIP Gift Registry** | `getGiftRecords()`, `createGiftRecord()`, `updateGiftRecord()`, `deleteGiftRecord()` | Tracks gifts given and received, occasion, estimated value, giver/recipient contacts. |
| **FC-09** | **VIP Principal Auth** | `checkVipPrincipalExists()`, `login()` | Checks onboarding status without credential leakage; issues token upon valid password hash. |
| **FC-10** | **Staff Onboarding Flow** | `submitStaffRequest()`, `getVipStaffAccounts()`, `respondToStaffRequest()`, `reassignStaffVip()` | Complete lifecycle from pending registration to VIP approval or rejection. Reassignment requires VIP owner session. |
| **FC-11** | **FCM Device Push** | `registerDeviceToken()`, `deactivateDeviceToken()`, `deactivateAllUserTokens()` | Capacitor / Android native token registration, rotation, and logout deactivation via RPC. |
| **FC-12** | **Invitation Image Upload** | `uploadInvitationImage(file, vipId)` | Uploads image files into Supabase Storage under `invitations/{vipId}/{eventId}/...` with tenant isolation. |
| **FC-13** | **Realtime Synchronization** | `realtimeService.subscribeToAll()` | Broadcasts INSERT, UPDATE, and DELETE changes instantly across all 10 subscribed tables using `REPLICA IDENTITY FULL`. |
| **FC-14** | **User Profile Management** | `lookupUserAccount()`, `updateUserProfile()` | Reads and updates user display name, phone, and avatar without exposing password hashes or tokens. |

---

## Part 3: Acceptance & Sign-Off Criteria for Production Go-Live

To achieve formal GO/NO-GO approval for production migration:
1. **Preflight Guard Pass:** `00_preflight_guard.sql` fails closed unless `app.settings.expected_project_ref` is explicitly configured.
2. **Staging Schema Integrity:** All migration files `00` through `07` execute without errors on Staging `kdbkfmzsdinkvslvgson`.
3. **Smoke Test Pass:** `99_test_validation_suite.sql` completes with zero assertion failures and rolls back cleanly (`ROLLBACK;`).
4. **Security Test Suite:** All 14 security test cases (`SEC-TC-01` through `SEC-TC-14`) pass with verified audit evidence.
5. **Application Build & Smoke Test:** The React application connects to Staging, authenticates, and passes all 14 feature contracts (`FC-01` through `FC-14`).
6. **Real Push Delivery:** FCM push notifications are successfully delivered to a physical test Android device via Staging.
