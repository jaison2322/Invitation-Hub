# Detailed Implementation Plan: Invitation Hub — Gift History Enhancement

**Document Version:** 1.0.0  
**Status:** Ready for Review & Execution  
**Project:** Invitation Hub (VIP Scheduling & Event Intelligence)  
**Target Module:** Gift History (`src/routes/GiftHistoryScreen.tsx`), Event Detail (`src/routes/EventDetailScreen.tsx`), Database Services, and Supabase Schema  

---

## 1. Executive Summary & Objective

The objective is to upgrade the existing **Gift History** screen in the Invitation Hub application into a dual-mode **Gift Received / Gift Given** ledger without altering the core visual identity, navigation, color scheme, or existing features.

### Key Deliverables
1. **Refined Screen Layout:** Move the "Gift History" header upward to optimize vertical screen space on mobile viewports.
2. **Segmented Mode Selector:** Seamless toggle between **Gift Received** (default) and **Gift Given** without navigating away or losing context.
3. **Gift Received Continuity:** Full preservation of existing gift-received records derived from past family functions (`family_events`), retaining search, category filtering, and guest-to-event associations.
4. **Gift Given Capability:**
   - Prominent, role-gated **"+"** button at the top-right of the content area for authorized users (VIP Admin & permitted staff).
   - Event selection modal/sheet listing saved events (invitations & functions), highlighting and prioritizing past/ended events.
   - Gift Given entry form faithfully replicating the design and fields of the existing Gift Received form (Gift name, Category, Estimated Value in ₹, Notes, Recipient).
   - Strict validation, duplicate-submission guards, and immediate optimistic + persistent database storage.
5. **Event Lifecycle & Detail Page Continuity:**
   - Robust relational binding to the event's permanent ID (`event_id`).
   - Seamless continuity when upcoming events transition to past events (`isInvitationPastByDate`).
   - Dedicated "Gifts Given" section in `EventDetailScreen` (`/event/:id`).
6. **Database Integrity & Multi-Tenant Isolation:**
   - Dedicated `public.gift_records` table with Supabase Row Level Security (RLS) policies scoped strictly to `vip_id = get_auth_vip_id()`.
   - Backward-compatible synchronization in `supabaseDbService.ts` and Zustand store with offline local persistence (`localStorage`).

---

## 2. Codebase & Architectural Inspection Findings

### A. Existing UI & Components
- **Gift History Screen (`src/routes/GiftHistoryScreen.tsx`):**
  - Features stationary header with back button, `Gift History` title, search input, horizontal scrolling category pills (`All Gifts`, `Gold`, `Silver`, `Cash`, `Electronics`, `Other`).
  - Currently extracts received gifts via:
    ```ts
    const allGifts = familyEvents.flatMap(event =>
      event.guests.filter(g => g.gift).map(g => ({ ...g, eventName: event.name, eventDate: event.date }))
    );
    ```
- **Gift Received Modal Form (`src/routes/PastEventDetailScreen.tsx` lines 862–941):**
  - Form layout consists of:
    - Input: `Gift Received` (`placeholder="Enter gift"`)
    - 2-Column Grid: `Gift Category` dropdown + `Estimated Value (₹)` numeric input
    - Textarea: `Notes` (`placeholder="Enter notes here..."`)
    - Action buttons: `Cancel` (ghost) and `Save Record` (primary blue/gold)
- **Navigation & Android Layout:**
  - Standard bottom navigation bar (`AppHeader.tsx` / `BottomNav`) with safe area padding.
  - Sticky stationary header (`.screen-stationary-header`) and scrollable body (`.screen-scroll-body`).

### B. Event Lifecycle Architecture
- **Invitations (`public.invitations`):**
  - Events to which the VIP is invited (weddings, receptions, birthdays, etc.).
  - Has `id`, `title`, `host_name`, `main_person`, `date`, `time`, `venue`, `location`, `priority`, `status`.
  - In `UpcomingInvitationsScreen.tsx`, events dynamically transition between **Upcoming** and **Past** based on `isInvitationPastByDate(inv, todayStr)`.
  - The record's `id` never changes; no duplicate or replacement records are generated upon date passage.
- **Family Functions (`public.family_events`):**
  - Events hosted by the VIP where attendees gave gifts to the VIP family.

### C. Authentication & Role Permissions
- Primary auth: `user_accounts` partitioned by `vip_id`.
- Roles: `role: 'vip'` (full admin) and `role: 'staff'` (delegated permissions in `permissions` JSONB).
- Permission check:
  - Viewing gifts: `isVIP || currentPrivilegedUser?.permissions?.canViewGiftHistory !== false`
  - Adding/editing gifts: `isVIP || (currentPrivilegedUser?.permissions?.canViewGiftHistory !== false && currentPrivilegedUser?.permissions?.canEditEvents !== false)`

---

## 3. Database Schema & Migration Plan

To satisfy requirements of relational integrity, tenant isolation, and future extensibility without bloating the `invitations` or `family_events` tables, we will introduce a dedicated `public.gift_records` table via a safe migration.

### Migration SQL (`supabase/migrations/20261011_add_gift_records.sql`)
```sql
-- ==============================================================================
-- Migration: Add gift_records table for Gift Given & Received Ledger
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.gift_records (
    id TEXT PRIMARY KEY,
    vip_id TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'given' CHECK (direction IN ('received', 'given')),
    event_id TEXT NOT NULL,
    event_title TEXT NOT NULL,
    event_date DATE NOT NULL,
    event_type TEXT,
    event_venue TEXT,
    recipient_name TEXT,
    recipient_person_id TEXT REFERENCES public.people(id) ON DELETE SET NULL,
    gift_name TEXT NOT NULL,
    gift_category TEXT NOT NULL DEFAULT 'other',
    estimated_value NUMERIC,
    notes TEXT,
    created_by TEXT DEFAULT 'vip',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_gift_records_vip_id ON public.gift_records(vip_id);
CREATE INDEX IF NOT EXISTS idx_gift_records_event_id ON public.gift_records(event_id);
CREATE INDEX IF NOT EXISTS idx_gift_records_direction ON public.gift_records(direction);
CREATE INDEX IF NOT EXISTS idx_gift_records_date ON public.gift_records(event_date DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.gift_records ENABLE ROW LEVEL SECURITY;

-- Grant API Permissions
GRANT ALL ON TABLE public.gift_records TO anon, authenticated, service_role;

-- Tenant Isolation Policies using existing get_auth_vip_id() helper
CREATE POLICY "gift_records_isolated_select" 
    ON public.gift_records FOR SELECT TO anon, authenticated 
    USING (vip_id = public.get_auth_vip_id());

CREATE POLICY "gift_records_isolated_insert" 
    ON public.gift_records FOR INSERT TO anon, authenticated 
    WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "gift_records_isolated_update" 
    ON public.gift_records FOR UPDATE TO anon, authenticated 
    USING (vip_id = public.get_auth_vip_id()) 
    WITH CHECK (vip_id = public.get_auth_vip_id());

CREATE POLICY "gift_records_isolated_delete" 
    ON public.gift_records FOR DELETE TO anon, authenticated 
    USING (vip_id = public.get_auth_vip_id());
```

---

## 4. UI/UX Detailed Design Specifications

### A. Gift History Header & Segmented Selector
1. **Vertical Space Optimization:**
   - Reduce top spacing in `.screen-stationary-header` and `.screen-header` from `padding-top: var(--space-4)` to compact `padding-top: var(--space-2)`.
   - Align the Back button and Title on a single line:
     ```tsx
     <div className="flex items-center justify-between mb-2">
       <div className="flex items-center gap-3">
         <button className="btn-icon" onClick={() => navigate(-1)} aria-label="Go Back">
           <ArrowLeft size={16} />
         </button>
         <h2 className="font-heading font-bold text-white text-xl">Gift History</h2>
       </div>
       {activeTab === 'given' && canManageGifts && (
         <button 
           className="btn btn-sm btn-gold flex items-center gap-1.5 shadow-md"
           onClick={() => setShowEventPicker(true)}
           aria-label="Record Gift Given"
         >
           <Plus size={15} strokeWidth={2.5} />
           <span>Record Gift</span>
         </button>
       )}
     </div>
     ```
2. **Segmented Mode Selector:**
   - Directly underneath the title, render a high-contrast segmented control matching the iOS/luxury theme:
     ```tsx
     <div className="segmented-control mb-3">
       <button
         type="button"
         className={`segmented-item ${activeTab === 'received' ? 'active' : ''}`}
         onClick={() => setActiveTab('received')}
       >
         Gift Received
       </button>
       <button
         type="button"
         className={`segmented-item ${activeTab === 'given' ? 'active' : ''}`}
         onClick={() => setActiveTab('given')}
       >
         Gift Given
       </button>
     </div>
     ```
3. **Preserved Search & Filters:**
   - Maintain the search bar: `"Search gifts such as gold, silver, etc..."`.
   - Category filter pills: `All Gifts`, `Gold`, `Silver`, `Cash`, `Electronics`, `Other`.
   - Switching tabs immediately recalculates the active item list without reloading the page.

### B. Event Selection Flow (`SelectEventModal`)
When the authorized user taps `+` / `Record Gift`:
1. Modal header: "Select Function / Event" with close button.
2. Search input for filtering events by title, host, or location.
3. Event list display:
   - Evaluates all `invitations` and `familyEvents`.
   - Categorizes events into **Ended / Past Functions** (prioritized at the top with a distinct "Past Function" badge) and **Upcoming Events** (clearly distinguished with "Upcoming" badge).
   - Each card displays:
     - Event Title (e.g., "Rajesh & Meera Wedding Reception")
     - Host / Main Person (e.g., "Hosted by Rajesh Kumar")
     - Date (formatted) + Venue / Location
   - Tapping an event immediately transitions to the Gift Given Entry Form with that event pre-selected.
4. Empty state: If no events exist, show a clean prompt with an option to create an event.

### C. Gift Given Entry Form (`AddGiftGivenModal`)
Faithfully duplicates the structure shown in Screenshot 2:
1. **Event Banner Card:**
   - Display a compact glass badge showing: `Event: [Title] · [Host] · [Date]`.
2. **Form Fields:**
   - **Gift Name / Description:**
     - Label: `Gift Given`
     - Input: `placeholder="Enter gift"` (e.g., "Gold Coin 8g", "Smart Watch")
   - **2-Column Grid:**
     - Column 1: `Gift Category` dropdown (`Gold`, `Silver`, `Cash`, `Electronics`, `Clothing`, `Other`)
     - Column 2: `Estimated Value (₹)` input (`placeholder="Enter gift value"`)
   - **Notes:**
     - Textarea: `placeholder="Enter notes here..."`
   - **Recipient Name (Optional):**
     - Pre-filled with event host/main person, editable if given to a specific family member.
3. **Buttons:**
   - `Cancel` button (cancels and closes modal).
   - `Save Record` button (primary blue/gold button with spinner during async save).
4. **Validation & Duplicate Protection:**
   - Disables submit when gift name is empty.
   - Sets `isSubmitting = true` on click to prevent double-tap race conditions.

### D. Gift Given Record Cards
Consistent visual hierarchy with Gift Received cards:
- Recipient / Host Avatar squircle with initials.
- Gift Name (bold white) + `GiftBadgeIcon` for category.
- Event Name & Event Date (e.g., "Rajesh & Priya Wedding · Dec 14, 2025").
- Estimated value badge in gold (`₹50,000`).
- Notes snippet.
- Action options: Edit and Delete buttons for authorized users.

---

## 5. Event Detail Screen Integration (`EventDetailScreen.tsx`)

In `EventDetailScreen.tsx` (`/event/:id`):
1. Add a dedicated **"Gifts Given"** section right after or alongside the event metadata:
   - Displays all gifts recorded for `invitation.id` with `direction: 'given'`.
   - Shows gift name, category icon, value in ₹, and recipient.
   - Includes an inline `+ Record Gift` shortcut if the user has permissions.
2. **Lifecycle Continuity Guarantee:**
   - When an invitation's date passes, `isInvitationPastByDate` marks it as past.
   - Because the event's `id` remains constant, all linked `gift_records` remain attached without any manual migration or data duplication.

---

## 6. Security, Authorization & RLS Rules

| User Role | View Gift History | Add / Edit Gift Given | Delete Gift Given |
|---|---|---|---|
| **VIP Principal (Admin)** | Full Access | Full Access | Full Access |
| **Staff (Permitted)** | Allowed if `canViewGiftHistory !== false` | Allowed if `canEditEvents !== false` | Allowed if `canEditEvents !== false` |
| **Staff (Restricted)** | Access Restricted Screen | Hidden "+" Button, Blocked API | Blocked |
| **Unauthorized User** | Blocked | Blocked | Blocked |

All requests include `x-vip-id` and `x-user-token` headers, verified by Supabase RLS policies via `public.get_auth_vip_id()`.

---

## 7. Implementation Roadmap & Phases

### Phase 1: Data Model & Store Infrastructure
- [ ] Create `GiftRecord` interface in `src/types/index.ts`.
- [ ] Add `giftRecords: GiftRecord[]` to Zustand store in `src/store/useAppStore.ts`.
- [ ] Add store actions: `addGiftRecord`, `updateGiftRecord`, `removeGiftRecord`.
- [ ] Implement database service methods in `src/services/supabaseDbService.ts`:
  - `getGiftRecords(vipId)`
  - `insertGiftRecord(record, vipId)`
  - `deleteGiftRecord(id, vipId)`
- [ ] Update `realtimeService.ts` to listen to `gift_records` postgres changes.
- [ ] Create migration script `supabase/migrations/20261011_add_gift_records.sql`.

### Phase 2: Gift History UI Overhaul
- [ ] Update `src/routes/GiftHistoryScreen.tsx`:
  - Compact stationary header (move heading upward).
  - Add segmented control (`Gift Received` / `Gift Given`).
  - Add "+" button for authorized users when `Gift Given` is selected.
  - Implement dual filtering logic for received gifts and given gifts.
  - Render consistent glass cards for given gifts.
  - Render dedicated empty state for given gifts.

### Phase 3: Event Selection & Entry Modal Flow
- [ ] Implement `SelectEventModal` component or inline modal within `GiftHistoryScreen.tsx`.
- [ ] Implement `AddGiftGivenModal` reusing the field layout from `PastEventDetailScreen.tsx`.
- [ ] Add input validation and double-click prevention.
- [ ] Link saved record to `selectedEvent.id`.

### Phase 4: Event Detail Page Integration
- [ ] Update `src/routes/EventDetailScreen.tsx`:
  - Add "Gifts Given" section filtering `giftRecords.filter(g => g.eventId === id)`.
  - Include quick "+" button to record gifts directly from the event overview.

### Phase 5: Verification & Testing
- [ ] Test tab switching, search, category filtering, and responsive design.
- [ ] Verify multi-tenant isolation and permission gating.
- [ ] Verify event lifecycle continuity when events transition from Upcoming to Past.
