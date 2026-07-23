# Seating & Assets — Context and Debug Guide

Everything a developer needs to understand, extend, and debug the seating layout
and asset management systems. Read this before touching either feature.

---

## 1. Current state (what exists vs what's planned)

### Seating — current
- `Employee.seat_label` (String 120, nullable) — plain string on the employee row.
  Migration `20260722_0026_add_employee_seat_label.py`.
- `POST /api/v1/employees/{id}/seat` — updates `seat_label`, audits, returns onboarding
  progress. No seat inventory validation.
- `SeatingAllocationModal.tsx` — 5×8 static grid, 12 hardcoded `OCCUPIED_SEATS`. Purely
  mock; occupancy is not read from the DB.

### Seating — planned (next build)
- `Seat` model / `seats` table with status (AVAILABLE/OCCUPIED/RESERVED/MAINTENANCE/BLOCKED),
  zone, row, col, employee_id FK.
- `GET /api/v1/seats` — all seats with real occupancy.
- `POST /api/v1/seats/{label}/assign`, `/vacate`, `PATCH /status`.
- `SeatsPage.tsx` — full floor grid UI matching the reference image.

### Assets — current
- `EmployeeAsset` model (`employee_assets` table) — fully defined with 4 statuses.
- Created automatically during onboarding (5 per employee: Laptop, Accessories, ID card,
  Email access, Software access). Status always starts `ASSIGNED`.
- **No assets API endpoint exists.** No `/assets` page (renders `PlaceholderPage`).

### Assets — planned (next build)
- `GET /api/v1/assets` with `employee_id=` / `status=` filters.
- `PATCH /api/v1/assets/{id}/status` for return/lost lifecycle.
- `AssetsPage.tsx` — DataTable with status filter and return actions.

---

## 2. `EmployeeAsset` model reference

**File:** `backend/app/models/employee/models.py:226-238`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | auto |
| `employee_id` | UUID FK → employees.id CASCADE | required |
| `asset_type` | String(120) | e.g. "Laptop", "ID card" |
| `asset_code` | String(120) indexed | e.g. "REQ-LAPTOP-a1b2c3d4" |
| `assigned_at` | DateTime(tz) nullable | set when physically handed over |
| `returned_at` | DateTime(tz) nullable | set on RETURNED |
| `asset_status` | String(40) | ASSIGNED / RETURN_PENDING / RETURNED / LOST |
| `metadata_json` | JSONB | `{"source": "onboarding_agent"}` |

**AssetStatus enum:** `backend/app/models/employee/models.py:48-52`

### Lifecycle
```
onboarding create → ASSIGNED
HR decides to collect → RETURN_PENDING
Employee hands back → RETURNED (set returned_at)
Lost/stolen → LOST
```

### Where assets are created
`backend/app/agents/onboarding_agent/service.py` → `_create_employee_from_onboarding` (line ~349):
```python
for asset in ASSET_CHECKLIST:   # defined in onboarding_agent/tools.py:22-28
    db.add(EmployeeAsset(
        employee_id=employee.id,
        asset_type=asset["name"],
        asset_code=f"REQ-{asset['name'].upper().replace(' ', '-')}-{str(employee.id)[:8]}",
        asset_status="ASSIGNED",
        metadata_json={"source": "onboarding_agent"},
    ))
```

`ASSET_CHECKLIST` (tools.py:22-28): Laptop, Accessories, ID card, Email access, Software access.

### How to add a new asset type
1. Add to `ASSET_CHECKLIST` in `backend/app/agents/onboarding_agent/tools.py`.
2. Re-onboard (existing employees won't get it retroactively unless you run a data migration).
3. Or add a `POST /assets` endpoint to create one-off assets for existing employees.

---

## 3. `Employee.seat_label` — how seating works today

**Assignment flow:**
1. User clicks a seat in `SeatingAllocationModal` (profile page or agent chat).
2. Frontend calls `setEmployeeSeat(employeeId, "A-3")` → `POST /api/v1/employees/{id}/seat`.
3. Backend updates `employees.seat_label = "A-3"`, writes AuditLog, returns onboarding progress.
4. Frontend invalidates `["employee-onboarding-progress", id]`, `["employee", id]`, `["employees"]`.

**Debug: seat not saving**
```sql
SELECT id, first_name, last_name, seat_label FROM employees
WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 10;
```
Check the AuditLog: `SELECT * FROM audit_logs WHERE action = 'employee.seat_assigned' ORDER BY created_at DESC LIMIT 5;`

**Debug: modal still shows wrong occupancy**
The current modal uses a hardcoded static set — it does NOT read the DB. Until the real `seats`
table and API are built, occupancy is always the same 12 static seats. After the `Seat` model
is added, the modal will be wired to `GET /seats`.

---

## 4. Planned `Seat` model (migration 20260722_0027)

When built, the `seats` table will contain:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | auto |
| `label` | String(20) indexed | "A-1", "PANTRY", "MEETING-A" |
| `zone` | String(40) nullable | "A-Zone", "B-Zone" |
| `row` | String(10) nullable | "A".."E" |
| `col` | Integer nullable | 1..8 |
| `seat_type` | String(40) | WORKSTATION / MEETING_ROOM / SPECIAL |
| `status` | String(40) | AVAILABLE/OCCUPIED/RESERVED/MAINTENANCE/BLOCKED |
| `employee_id` | UUID FK nullable → employees.id SET NULL | denormalized for fast reads |

**Seating assignment flow (after build):**
`POST /seats/{label}/assign` → validates seat AVAILABLE, sets `seats.status=OCCUPIED`,
`seats.employee_id`, AND `employees.seat_label` (both updated atomically in one commit).

**Seating vacate flow:**
`POST /seats/{label}/vacate` → sets `seats.status=AVAILABLE`, `seats.employee_id=null`,
`employees.seat_label=null`.

**Debug: seat/employee mismatch (after migration 0027)**
If `seats.employee_id` and `employees.seat_label` get out of sync (e.g. crash mid-transaction):
```sql
-- Find mismatches:
SELECT e.id, e.first_name, e.seat_label, s.label, s.employee_id
FROM employees e
LEFT JOIN seats s ON s.label = e.seat_label
WHERE e.deleted_at IS NULL
AND (s.employee_id != e.id OR (e.seat_label IS NOT NULL AND s.label IS NULL));
```
Fix: `UPDATE seats SET status='AVAILABLE', employee_id=null WHERE label='<label>';`
then `UPDATE employees SET seat_label=null WHERE id='<id>';` then re-assign.

---

## 5. The seating floor grid — layout rules

The reference image (Image #13) shows:
- **A-Zone:** rows A–B, cols 1–8 (16 workstation seats)
- **B-Zone:** rows C–E, cols 1–8 (24 workstation seats)
- **Special:** PANTRY (non-clickable), MEETING-A (8 seats), MEETING-B (6 seats)
- **Status colors:** green=AVAILABLE, red=OCCUPIED, blue=RESERVED, yellow=MAINTENANCE, grey=BLOCKED
- Occupied seats show employee avatar initial + name in the cell
- Right panel: Seat Details (employee info + asset list + allocation info + Move/Vacate actions)
- Bottom: Floor Summary counts + Occupancy %

**The seed in migration 0027 creates:**
- A-1 through A-8 (zone A-Zone, row A)
- B-1 through B-8 (zone A-Zone, row B)
- C-1 through C-8 (zone B-Zone, row C)
- D-1 through D-8 (zone B-Zone, row D)
- E-1 through E-8 (zone B-Zone, row E)
- PANTRY (special), MEETING-A (special), MEETING-B (special)

**Seeding occupied from existing employees:** the migration reads `employees.seat_label` and for
any non-null value sets the matching `seats` row to OCCUPIED + sets `employee_id`.

---

## 6. Common breakage points

### Seating

| Symptom | Likely cause | Fix |
|---|---|---|
| Seat saves but onboarding % doesn't update | Query invalidation didn't fire | Check browser dev tools Network tab for `onboarding-progress` refetch. Hard-refresh. |
| Two employees showing same seat in grid | Seat assigned without checking occupancy | After `seats` table exists: add unique constraint on `seats.employee_id` (non-null), add availability check in assign endpoint. |
| Seat modal always shows same occupancy | Static `OCCUPIED_SEATS` set in modal — not reading DB | Wait for the `Seat` model build; until then it's expected behaviour. |
| `POST /seats/{label}/assign` 404 | Seats API not yet built or not registered in router | Confirm `from app.api.v1.endpoints import seats` in `router.py` and alembic head is `0027`. |
| `alembic upgrade head` fails on 0027 | Model not imported in `app/db/base.py` | Add `from app.models.employee.models import Seat` to `backend/app/db/base.py` imports. |

### Assets

| Symptom | Likely cause | Fix |
|---|---|---|
| `/assets` shows PlaceholderPage | AssetsPage not yet built or route not updated | Check `router.tsx` — is it still `PlaceholderPage`? |
| `GET /assets` 403 | `assets:view` permission not seeded | Run `python -m scripts.seed_auth` after adding the permission to `auth_service.py`. |
| Employee has no assets in profile | They were onboarded manually (form), not via agent | Assets are only auto-created by `_create_employee_from_onboarding` in the onboarding agent. Manual form creation does NOT auto-create assets. Add them manually via the assets endpoint once built. |
| Asset status won't update | `returned_at` not being set on RETURNED | The `PATCH /assets/{id}/status` endpoint must set `returned_at = now()` when `status == "RETURNED"`. Check the endpoint logic. |

---

## 7. Quick DB queries for debugging

```sql
-- All seats and who's in them:
SELECT s.label, s.zone, s.status, e.first_name, e.last_name
FROM seats s
LEFT JOIN employees e ON e.id = s.employee_id
ORDER BY s.zone, s.label;

-- Floor summary counts:
SELECT status, COUNT(*) FROM seats GROUP BY status;

-- All assets for an employee:
SELECT asset_type, asset_code, asset_status, assigned_at, returned_at
FROM employee_assets
WHERE employee_id = '<uuid>'
ORDER BY created_at;

-- Employees without assets (manual-created, not via onboarding agent):
SELECT e.id, e.first_name, e.last_name
FROM employees e
WHERE e.deleted_at IS NULL
AND NOT EXISTS (SELECT 1 FROM employee_assets ea WHERE ea.employee_id = e.id);

-- Asset status breakdown:
SELECT asset_status, COUNT(*) FROM employee_assets GROUP BY asset_status;
```

---

## 8. API reference (seating + assets)

After the planned build, the full API surface will be:

```bash
# --- SEATING ---
# List all seats (with occupancy):
GET  /api/v1/seats

# Assign employee to seat:
POST /api/v1/seats/{seat_label}/assign
     body: {"employee_id": "<uuid>"}

# Vacate a seat:
POST /api/v1/seats/{seat_label}/vacate

# Change seat status (RESERVED, MAINTENANCE, BLOCKED, AVAILABLE):
PATCH /api/v1/seats/{seat_label}/status
      body: {"status": "MAINTENANCE"}

# Existing (still works, delegates to assign logic):
POST /api/v1/employees/{id}/seat
     body: {"seat_label": "A-3"}

# --- ASSETS ---
# List all assets (filter optional):
GET  /api/v1/assets?employee_id=<uuid>&status=ASSIGNED

# Update asset status:
PATCH /api/v1/assets/{id}/status
      body: {"status": "RETURNED"}

# Swagger (all endpoints documented):
GET  http://127.0.0.1:8000/docs
GET  http://127.0.0.1:8000/redoc
```
