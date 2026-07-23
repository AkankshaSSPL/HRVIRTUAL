# Remaining Work — Hyper-Detailed Implementation Plan

**Date:** 2026-07-23 · **Repo:** `AkankshaSSPL/HRVIRTUAL` · **Branch:** `main`
**DB at:** alembic `20260722_0027` (seats table exists, 43 rows, all AVAILABLE)
**Backend:** `:8000` · **Frontend:** `:5173` · **Login:** `admin@example.com / ChangeMe123!`

Estimated total effort: **~6–7 hours**

---

## Status snapshot (verified from code)

| Feature | State |
|---|---|
| `Seat` model + migration + `seats` table | ✅ Done — 43 seats seeded, all AVAILABLE |
| `GET/POST/PATCH /seats` API + `seat_service.py` | ✅ Done |
| `SeatsPage.tsx` | ✅ Built — but NOT wired to `/seats` route or Sidebar |
| Seat occupancy seeded from employees | ❌ 0 employees have `seat_label`; seats table shows 0 OCCUPIED |
| `SeatingAllocationModal` — live API data | ✅ Done (uses `getSeats`) |
| `/assets` + `/assets/types` API | ✅ Done |
| Asset Types card in Masters | ✅ Done |
| Asset allocation section in profile/onboarding | ✅ Done |
| Assets tab in profile drawer | ✅ Done |
| `AssetsPage.tsx` | ❌ Does not exist — `/assets` renders `PlaceholderPage` |
| Agent keywords ("onboard"/"hire") | ❌ Commented out — lines 68-70 in coordinator service |
| Upload progress spinner in agent chat | ❌ Not implemented |
| Profile tabs scrollable fix | ⚠️ Tabs use `flex-wrap` — wraps to 2 lines on narrow width |
| Employee form — salary + bank branch | ⚠️ Has bank/IFSC/PAN; missing: UAN, Aadhaar, DOB/gender in payroll step |
| Swagger `/docs` | ✅ Already accessible |

---

## P1 — Quick wins (35 min total)

### P1-1 · Wire SeatsPage route + Sidebar (10 min)

**File: `frontend/src/routes/router.tsx`**

`/seats` is currently missing from the routes. Add it under `employees:view` guard:
```tsx
// After the /employees/:id route (around line 37):
import { SeatsPage } from "@/pages/SeatsPage";
...
{ element: <ProtectedRoute permission="employees:view" />,
  children: [{ path: "/seats", element: <SeatsPage /> }] },
```

**File: `frontend/src/components/ui-system/Sidebar.tsx`**

`/seats` is missing from `sidebarItems`. Add after the Onboarding entry:
```ts
{ name: "Seat Layout", href: "/seats", icon: LayoutGrid, permission: "employees:view" },
```
`LayoutGrid` is already imported in `SeatsPage.tsx` — add it to the Sidebar import line.

---

### P1-2 · Sync seat occupancy from employees (10 min)

**Problem:** The `seats` table was seeded with 43 AVAILABLE seats, but no employee currently has a `seat_label` (all NULL in DB). So the floor grid shows everything as AVAILABLE even though employees may have seats assigned.

**Fix — one-time SQL sync in `seat_service.py` or a migration script:**

In `backend/app/services/seat_service.py`, the `assign_seat` function already syncs both tables atomically going forward. The issue is historical data. Add a `sync_seat_occupancy` helper or run this via the seed script:

```sql
-- Run once to backfill:
UPDATE seats s
SET status = 'OCCUPIED',
    employee_id = e.id,
    updated_at = now()
FROM employees e
WHERE e.seat_label = s.label
  AND e.deleted_at IS NULL
  AND e.seat_label IS NOT NULL;
```

Expose this as `POST /seats/sync` (admin-only, idempotent) OR run as a one-off via psql. Simpler: call it from `scripts/seed_auth.py` as a post-seed step.

---

### P1-3 · Agent onboarding keywords — 3 uncomments (5 min)

**File: `backend/app/agents/coordinator_agent/service.py` lines 68-70**

Uncomment these three lines in `CRITICAL_ACTION_KEYWORDS`:
```python
"onboard":          ("onboarding_agent", "start", "onboarding", "start"),
"hire":             ("onboarding_agent", "start", "onboarding", "start"),
"start onboarding": ("onboarding_agent", "start", "onboarding", "start"),
```
Also uncomment line 534 in `_analyze_intent`:
```python
if "onboard" in normalized or "start onboarding" in normalized or "hire " in normalized:
    return self._route("onboarding_agent", "start", "onboarding", "start", "onboarding")
```

---

### P1-4 · Profile tabs — fix wrapping (10 min)

**File: `frontend/src/components/ui-system/BusinessResponseCards.tsx` line 748**

Current: `<div className="flex flex-wrap gap-2 border-b pb-2">` — wraps to multiple lines when there are many tabs.

Fix: make tabs a horizontal scrollable row instead of wrapping:
```tsx
<div className="flex gap-1 border-b pb-0 overflow-x-auto scrollbar-none -mb-px">
  {tabs.map((item) => (
    <Button key={item} type="button" size="sm"
      variant={tab === item ? "default" : "ghost"}
      className="shrink-0 rounded-b-none"
      onClick={() => setTab(item)}>
      {item}
    </Button>
  ))}
</div>
```
This matches the reference UI — single-row tabs that scroll if they overflow.

---

## P2 — Assets Management Page (3–4 hrs)

**File to create: `frontend/src/pages/AssetsPage.tsx`**

**Update: `frontend/src/routes/router.tsx`** — change `/assets` from `PlaceholderPage` → `AssetsPage`.
**The `/assets` sidebar entry already exists** — just needs the real page.

### Layout

```
[Assets]                                          [+ Add Asset]
Track and manage employee equipment assignments.

[All] [Assigned] [Return Pending] [Returned] [Lost]    Search...

DataTable:
  Asset Code | Type | Name | Employee | Assigned At | Validity | Status | Actions
  LT-2026-001 | Laptop | Dell XPS 15 | Ravi Sharma | 2026-07-22 | — | Assigned | [Return] [Lost]
  ...

[Page 1 of N]   [Prev] [Next]
```

### Component breakdown

**1. Filter + search bar** — status chip pills using `Button` variant toggle (no new component).
Filter is client-side (small dataset). Search filters by employee name or asset code.

**2. DataTable** — reuse existing `DataTable` from ui-system barrel. Columns:
- Asset Code (monospace text)
- Type (string)
- Name (from `asset_name` or `metadata_json.asset_name`)
- Employee (link-style text navigating to `/employees/{id}`)
- Assigned At (date formatted)
- Validity (date + red "Expired" badge if `is_expired`)
- Status (`StatusBadge`: ASSIGNED=success, RETURN_PENDING=warning, RETURNED=neutral, LOST=danger)
- Actions: two ghost `Button` icons — "Mark Return Pending" (if ASSIGNED), "Mark Returned" (if RETURN_PENDING), "Mark Lost" (if ASSIGNED/RETURN_PENDING)

**3. Add Asset drawer** — reuse `DrawerPanel` size "md":
- Employee select (dropdown from `getEmployees()`, searchable)
- Asset Type select (dropdown from `getAssetTypes()` — 8 types)
- Asset Name input (optional e.g. "Dell XPS 15")
- Validity Date input (optional date picker, type="date")
- Submit → `createAsset(payload)` → invalidate `["assets"]`

**4. Status action** — clicking Return/Lost calls `updateAssetStatus(id, status)` then invalidates. No confirm dialog needed for Return Pending; add `ConfirmDialog` for "Mark Lost".

**Services already exist** in `assets.ts`: `getAssets`, `getAssetTypes`, `createAsset`, `updateAssetStatus`.

**Migration needed:** `asset_name` and `validity_date` columns don't exist on the model yet (currently read via `getattr` fallback in the endpoint). Add them:
- Migration `20260723_0028_add_asset_name_validity.py`, `down_revision="20260722_0027"`
- `op.add_column("employee_assets", sa.Column("asset_name", sa.String(120)))`
- `op.add_column("employee_assets", sa.Column("validity_date", sa.Date(), nullable=True))`
- Add to `EmployeeAsset` model in `models.py`

---

## P3 — Upload progress indicator in Agent Command (30 min)

**File: `frontend/src/pages/AgentCommandPage.tsx`**

The `uploadProgress` state (line ~870) and `uploadingResume`/`pendingUpload` booleans already exist. Wire them to a visible thin progress bar above the `CommandInput`:

Find the `CommandInput` render block (around line 1167) and add directly above it:
```tsx
{(uploadingResume || pendingUpload) && (
  <div className="px-4 pb-2">
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: uploadingResume ? `${uploadProgress ?? 30}%` : "100%" }}
      />
    </div>
    <p className="mt-1 text-xs text-muted-foreground">
      {uploadingResume
        ? `Uploading… ${uploadProgress ?? 0}%`
        : `Waiting for ${pendingUpload?.documentType ?? "document"} upload — use Attach below`}
    </p>
  </div>
)}
```

The `pendingUpload` state is the `awaiting_upload` from the agent (set at line ~823). When it's set (waiting for a document), the bar shows at 100% as a solid indicator. When `uploadingResume` is true, it animates with real progress.

---

## P4 — Employee form: missing Banking/Payroll fields (2 hrs)

The wizard already has: bank_account_number, IFSC, PAN, emergency contact (name/relationship/phone). Missing from the spec:

**Missing fields in payroll step:**
- UAN number (`uan_number` — model column exists on Employee)
- Aadhaar number (`aadhaar_number` — model column exists on Employee)
- DOB and gender are in Step 1 but may be missing from the payload check

**Missing from `EmployeeCreateRequest`** (`employees.py`):
- `uan_number: str | None = None`
- `aadhaar_number: str | None = None`

**File: `frontend/src/components/employees/EmployeeCreateWizard.tsx`**
- Add UAN and Aadhaar fields to Step 2 payroll section (after PAN, lines 233-234)
- Ensure `initialForm` and `EmployeeCreatePayload` type include these fields
- Add DOB (`dob`) if not already in Step 1 payload

**File: `frontend/src/services/employees.ts`**
- `EmployeeCreatePayload`: add `uan_number?: string`, `aadhaar_number?: string` if missing

---

## Sequencing

| Order | Item | Time |
|---|---|---|
| 1 | P1-1 Wire SeatsPage route + sidebar | 10 min |
| 2 | P1-2 Sync seat occupancy (SQL backfill) | 10 min |
| 3 | P1-3 Agent keywords uncomment | 5 min |
| 4 | P1-4 Profile tabs scroll fix | 10 min |
| 5 | P2 migration (asset_name + validity_date columns) | 15 min |
| 6 | P2 AssetsPage.tsx (DataTable + Add drawer) | 3–4 hrs |
| 7 | P3 Upload progress indicator | 30 min |
| 8 | P4 Employee form UAN/Aadhaar fields | 30 min |

**Total: ~6–7 hrs** · P1 = 35 min (highest bang/buck) · P2 = bulk of effort

---

## Verification

After all work:
1. `/seats` is in the sidebar and loads the floor grid with real occupancy (OCCUPIED cells show employee names).
2. Seating modal on the profile shows real occupancy from the API (not static).
3. `/assets` shows DataTable — filter by status, Add Asset creates a new row, Return action updates status.
4. Masters → Organization → Asset Types — Add/Edit/Delete the 8 types.
5. Agent: "hire Priya as developer, priya@x.com, joining today" → starts onboarding (keyword now live).
6. Agent chat Attach during onboarding → shows progress bar while uploading.
7. Employee profile tabs are a single horizontal scrollable row (no wrapping).
8. Employee create wizard payroll step has UAN + Aadhaar fields.
