# Seating Layout + Assets — Implementation Plan

Reference image: Image #13 (full floor grid with zones, coloured cells, side panel, floor summary).
**Context doc:** `docs/SEATING_ASSETS_CONTEXT.md` — read that first.

---

## Priority order

1. **Seating layout** — real floor grid, occupancy from DB, assign/vacate (MAIN)
2. **Assets management** — list, assign, return, employee view (MAIN)
3. **Agent control fixes** — re-enable onboarding keyword, attach upload spinner (QUICK)
4. **Swagger docs** — confirm `/docs` is accessible for testers (5 MIN)

---

## Backend

### B1 — Seat model + migration

**`backend/app/models/employee/models.py`**: Add after the existing `AssetStatus` enum:

```python
class SeatStatus(StrEnum):
    AVAILABLE   = "AVAILABLE"
    OCCUPIED    = "OCCUPIED"
    RESERVED    = "RESERVED"
    MAINTENANCE = "MAINTENANCE"
    BLOCKED     = "BLOCKED"

class Seat(BaseModel):
    __tablename__ = "seats"
    label:       Mapped[str]        = mapped_column(String(20),  nullable=False, index=True)
    zone:        Mapped[str | None] = mapped_column(String(40))
    row:         Mapped[str | None] = mapped_column(String(10))
    col:         Mapped[int | None] = mapped_column(Integer)
    seat_type:   Mapped[str]        = mapped_column(String(40),  server_default="WORKSTATION")
    status:      Mapped[str]        = mapped_column(String(40),  nullable=False, server_default="AVAILABLE")
    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"))
    employee: Mapped["Employee | None"] = relationship(foreign_keys=[employee_id])
```

**Also import `Integer` in the model file if not present.**

**New migration** `backend/alembic/versions/20260722_0027_add_seats_table.py`:
- `revision = "20260722_0027"`, `down_revision = "20260722_0026"`
- `upgrade()`: create `seats` table, then INSERT 40 rows:
  - A-Zone: rows A and B, cols 1–8 (labels "A-1"…"A-8", "B-1"…"B-8")
  - B-Zone: rows C, D, E, cols 1–8 (labels "C-1"…"E-8")
  - Specials: label="PANTRY" type="SPECIAL", label="MEETING-A" type="MEETING_ROOM", label="MEETING-B" type="MEETING_ROOM"
  - Seed occupancy: `UPDATE seats SET status='OCCUPIED', employee_id=e.id FROM employees e WHERE seats.label = e.seat_label AND e.deleted_at IS NULL AND e.seat_label IS NOT NULL`

**Import the model in `backend/app/db/base.py`** so alembic sees it.

Run: `alembic upgrade head`

---

### B2 — Seats API

**New `backend/app/api/v1/endpoints/seats.py`:**

```python
GET  /                          # list all seats; returns {seats: [...], summary: {available, occupied, ...}}
POST /{seat_label}/assign       # body {employee_id}; validates AVAILABLE/RESERVED; sets OCCUPIED+employee_id on seat, seat_label on employee; one commit
POST /{seat_label}/vacate       # sets AVAILABLE, clears employee_id + employee.seat_label; audits
PATCH /{seat_label}/status      # body {status}; for RESERVED/MAINTENANCE/BLOCKED/AVAILABLE changes by HR
```

Each seat in the list response includes:
```json
{
  "label": "A-1", "zone": "A-Zone", "row": "A", "col": 1,
  "seat_type": "WORKSTATION", "status": "OCCUPIED",
  "employee_id": "<uuid>",
  "employee_name": "Ravi Sharma",
  "employee_designation": "Developer",
  "employee_department": "Engineering",
  "employee_email": "ravi@x.com"
}
```

**Also update the existing `POST /employees/{id}/seat`** to call the same assign logic
(so the onboarding modal and new seats API stay in sync).

**Register in `backend/app/api/v1/router.py`:**
```python
from app.api.v1.endpoints import seats
api_router.include_router(seats.router, prefix="/seats", tags=["seats"])
```

---

### B3 — Assets API

**New `backend/app/api/v1/endpoints/assets.py`:**

```python
GET  /                    # filter by employee_id=, status=; includes employee name
PATCH /{asset_id}/status  # body {status}; sets returned_at when RETURNED
```

**Register in router:** `prefix="/assets", tags=["assets"]`

---

### B4 — `assets:view` permission

**`backend/app/services/auth_service.py`**: Add `"assets:view": "View and manage assets"` to `PERMISSIONS`.
Add to `ROLE_PERMISSION_CODES` for `Super Admin`, `HR Admin`, `HR Executive`.

Run: `python -m scripts.seed_auth`

---

### B5 — Agent fix: re-enable onboarding keywords

**`backend/app/agents/coordinator_agent/service.py` lines 60-62**: uncomment:
```python
"onboard":          ("onboarding_agent", "start", "onboarding", "start"),
"hire":             ("onboarding_agent", "start", "onboarding", "start"),
"start onboarding": ("onboarding_agent", "start", "onboarding", "start"),
```

---

### B6 — Swagger

**`backend/app/main.py`**: The FastAPI instance already has `docs_url="/docs"` and `redoc_url="/redoc"`.
Verify by hitting `http://127.0.0.1:8000/docs` — should show all routes. If behind an env guard,
remove it. No code change expected.

---

## Frontend

### F1 — `/seats` — Seat Layout page

**New `frontend/src/pages/SeatsPage.tsx`**

**New `frontend/src/services/seats.ts`:**
```typescript
export type SeatRecord = {
  label: string; zone: string | null; row: string | null; col: number | null;
  seat_type: string; status: string;
  employee_id: string | null; employee_name: string | null;
  employee_designation: string | null; employee_department: string | null;
  employee_email: string | null;
};
export type SeatSummary = { available: number; occupied: number; reserved: number; maintenance: number; blocked: number; };

getSeats()                              → GET /seats
assignSeat(label, employee_id)          → POST /seats/{label}/assign
vacateSeat(label)                       → POST /seats/{label}/vacate
updateSeatStatus(label, status)         → PATCH /seats/{label}/status
```

**Page layout:**

```
[Zone pills: All | A-Zone | B-Zone]    [Stat chips: Available 34 | Occupied 12 | ...]
[                    FLOOR GRID                          ] [ Seat Details panel ]
  PANTRY      MEETING-A (8 seats)    MEETING-B (6 seats)   (when seat selected)
  A-Zone:                                                    label, status badge
    A-1 (green) A-2 (red/Ravi) A-3 ...                      if occupied:
  B-Zone:                                                      employee card
    C-1 ...                                                     asset list
[Floor Summary: 40 total | 34 avail | 12 occ | 68% rate]   [Vacate | Move | Close]
```

**Grid cell colours (Tailwind cn):**
- AVAILABLE: `border-emerald-200 bg-emerald-50 text-emerald-700`
- OCCUPIED: `border-red-200 bg-red-50 text-red-700`
- RESERVED: `border-blue-200 bg-blue-50 text-blue-700`
- MAINTENANCE: `border-amber-200 bg-amber-50 text-amber-700`
- BLOCKED: `border-neutral-200 bg-neutral-100 text-neutral-500`
- Special (PANTRY/MEETING): `border-purple-100 bg-purple-50 text-purple-600 cursor-default`

**Side panel (when seat clicked):**
- Seat label + status badge
- If occupied: employee name, designation, dept, email, joining date
- Asset list: `GET /assets?employee_id={id}` — show asset_type + asset_code + status badge
- Actions: **Vacate Seat** (calls vacateSeat, confirms first via ConfirmDialog) + **Move Seat**
  (text input for new label → calls vacate then assign on new seat)
- Close panel on click-away or X

**Refetch interval:** 30 seconds.

**Add to routes (`router.tsx`):** under `employees:view` guard, path `/seats`.
**Add to sidebar (`Sidebar.tsx`):** after Onboarding entry, icon `LayoutGrid`.

---

### F2 — SeatingAllocationModal — live data

**`frontend/src/components/employees/SeatingAllocationModal.tsx`**:
- Remove static `OCCUPIED_SEATS` set.
- `useQuery(["seats"], getSeats)` inside the modal.
- A seat is occupied if `seat.employee_id !== null && seat.label !== currentSeat`
  (currentSeat = the employee's own seat, so they can re-select their own).
- Keep the 5×8 A–E × 1–8 grid; source occupancy and employee names from the API.

---

### F3 — `/assets` — Assets management page

**New `frontend/src/pages/AssetsPage.tsx`**

**New `frontend/src/services/assets.ts`:**
```typescript
getAssets(employeeId?: string, status?: string) → GET /assets
updateAssetStatus(id, status)                   → PATCH /assets/{id}/status
```

**Page layout:**
- Status filter pills: All | Assigned | Return Pending | Returned | Lost
- `DataTable` (reuse existing ui-system component) with columns:
  Asset Code | Type | Employee | Assigned At | Status (StatusBadge)
- Row actions: "Mark Return Pending" → "Mark Returned" → read-only after
- `refetchInterval: 30000`

**Update `router.tsx`:** change `/assets` from `PlaceholderPage` → `AssetsPage`.

---

### F4 — Upload progress spinner in Agent Command

**`frontend/src/pages/AgentCommandPage.tsx`**: already has `uploadProgress` state (number | null)
and `uploadingResume` boolean. Wire them to a visible progress bar above the command input:

```typescript
{(uploadingResume || pendingUpload) && (
  <div className="px-4 pb-1">
    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${uploadProgress ?? 50}%` }}
      />
    </div>
    <p className="text-xs text-muted-foreground mt-1">
      {uploadingResume ? `Uploading… ${uploadProgress ?? 0}%` : "Document upload pending"}
    </p>
  </div>
)}
```

---

## Verification

1. `GET /api/v1/seats` → JSON list with status + employee info, summary counts.
2. `/seats` page loads — grid shows coloured cells, occupied cells show employee names.
3. Click occupied cell → side panel shows employee + assets. Vacate → cell turns green, employee seat_label → null.
4. Onboarding modal in profile uses live seat data (no hardcoded static occupancy).
5. `/assets` → DataTable, status filter works, Mark Returned updates row.
6. `http://127.0.0.1:8000/docs` → all routes visible for testers.
7. Agent Command: "hire Priya" → now routes to onboarding (keyword re-enabled).
8. Agent Command: Attach a file during onboarding → progress bar shows above input while uploading.
