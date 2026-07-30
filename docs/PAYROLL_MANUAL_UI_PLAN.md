# Plan: Payroll Page — Manual Run UI

**Repo:** `D:\gunesh_dev\dev\temp\WorkingHRMS\HRVIRTUAL` (`develop` branch)  
**Task:** Add manual payroll generation, approval and export to PayrollPage (no agent command needed)

---

## Overall Completion: ~55%

| Area | Status | Notes |
|---|---|---|
| Computation engine (`compute_payroll_run`) | ✅ Done | `app/services/payroll_computation.py` |
| Export services (`generate_*_sheet`) | ✅ Done | `app/services/payroll_export.py` |
| Approval engine (`ApprovalEngineService`) | ✅ Done | `app/agents/approval_agent/service.py` |
| `PayrollRun` / `PayrollRunItem` models | ✅ Done | `app/models/payroll/models.py` |
| `metadata_json` column on `PayrollRun` | ✅ Done (model edit) | Migration still needed |
| `PayrollRunCard` component | ✅ Done | `frontend/src/components/payroll/PayrollRunCard.tsx` |
| `PayrollExportDownload` component | ✅ Done | `frontend/src/components/payroll/PayrollExportDownload.tsx` |
| Salary masters CRUD (components/structures) | ✅ Done | 16 existing routes |
| TriageAgent + SessionManager | ✅ Done | Akanksha pushed — NL routing redesign complete |
| `openpyxl` in `requirements.txt` | ✅ Done | Added to `backend/requirements.txt` line 17 |
| Migration `20260801_0036` | ❌ Missing | Adds `metadata_json` column to `payroll_runs` table |
| 4 REST endpoints for payroll runs | ❌ Missing | GET /runs, POST /runs, submit-approval, export |
| `payroll.ts` — 4 API functions | ❌ Missing | Replace dead comment block at end of file |
| `PayrollPage.tsx` — PayrollRuns section | ❌ Missing | First section above Salary Structures |
| NL agent command routing (chat flow) | 🔴 Broken | Known issue — TriageAgent fix pending, out of scope here |

---

## Context

Payroll generation/approval/export is currently agent-command only. No REST endpoints exist for payroll runs. User needs to generate sheets directly from the UI. The backend services (`compute_payroll_run`, `generate_*_sheet`) and the `PayrollRunCard` / `PayrollExportDownload` components are already built — only the 4 REST endpoints and frontend wiring are missing.

**Already done (no action needed):**
- `CompanySettingsPanel` is already on `MastersPage.tsx` (its own "Company Settings" tab) and is NOT on `PayrollPage.tsx` — no move required.
- Current alembic head: `20260731_0035` (conversation_sessions). New migration must chain from this.
- `metadata_json` column already added to `PayrollRun` model in `backend/app/models/payroll/models.py` — migration is the only remaining model step.

---

## What Exists (Reuse These)

| Component | File | Reuse |
|---|---|---|
| `compute_payroll_run(db, month, year) → tuple[list[dict], list[str]]` | `app/services/payroll_computation.py` | Call from POST /runs |
| `generate_employee_sheet(db, run, company) → str` | `app/services/payroll_export.py` | Call from POST /runs/{id}/export |
| `generate_consultant_sheet / generate_bank_sheet / generate_tds_sheet` | same file | Same |
| `ApprovalEngineService(db).create_approval(*, module_name, action_name, payload_json, approval_reason, requested_by, workflow_id)` | `app/agents/approval_agent/service.py` | Call from POST /runs/{id}/submit-approval |
| `GET /payroll/export/{filename}` | `app/api/v1/endpoints/payroll.py` | Already serves XLSX downloads, reused by export download URL |
| `PayrollRunCard` | `frontend/src/components/payroll/PayrollRunCard.tsx` | Drop in — props: `{runId, month: string, status, employeeCount, skipped?, exportsLocked, onExport, onSubmitApproval?}` |
| `PayrollExportDownload` | `frontend/src/components/payroll/PayrollExportDownload.tsx` | Drop in — props: `{title, filename, downloadUrl}` |
| `apiGet / apiPost` | `frontend/src/services/api.ts` | Used by all existing payroll.ts functions — use same pattern |

---

## Backend Changes

### 1. Add `metadata_json` to `PayrollRun` model

**File:** `backend/app/models/payroll/models.py`

Add one column to the `PayrollRun` class (after `approved_at`):
```python
metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
```

Stores `{"skipped": [...], "total_net_payable": 450000, "employee_count": 5}` at generation time. This avoids N+1 item-count queries on list endpoint.

### 2. New migration `20260801_0036_payroll_run_metadata.py`

```python
"""payroll run metadata column

Revision ID: 20260801_0036
Revises: 20260731_0035
Create Date: 2026-08-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260801_0036"
down_revision = "20260731_0035"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("payroll_runs",
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True))

def downgrade():
    op.drop_column("payroll_runs", "metadata_json")
```

### 3. New REST endpoints + helpers in `backend/app/api/v1/endpoints/payroll.py`

#### New imports to add at the top of payroll.py
```python
from typing import Literal                          # add to existing `from typing import Any`
from pydantic import ConfigDict                     # add to existing pydantic import
from sqlalchemy import delete                       # add to existing sqlalchemy import
from app.models.payroll.models import PayrollRun, PayrollRunItem, PayrollRunStatus
from app.services.payroll_computation import compute_payroll_run
from app.services.payroll_export import (
    generate_employee_sheet, generate_consultant_sheet,
    generate_bank_sheet, generate_tds_sheet,
)
from app.agents.approval_agent.service import ApprovalEngineService
```

#### New Pydantic schemas (add near top with other schemas)
```python
class PayrollRunCreateRequest(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2020, le=2099)

class PayrollExportRequest(BaseModel):
    type: Literal["employee", "consultant", "bank", "tds"]

class PayrollRunSummary(BaseModel):
    id: UUID
    month: int
    year: int
    status: str
    employee_count: int
    net_payable: float
    skipped: list[str]
    approved_at: datetime | None
    model_config = ConfigDict(from_attributes=True)
```

#### Helper functions (add before the new endpoints)
```python
def _get_run_or_404(db: Session, run_id: UUID) -> PayrollRun:
    run = db.scalar(
        select(PayrollRun).where(PayrollRun.id == run_id).where(PayrollRun.deleted_at.is_(None))
    )
    if not run:
        raise HTTPException(404, "Payroll run not found")
    return run

def _run_to_summary(run: PayrollRun) -> PayrollRunSummary:
    meta = run.metadata_json or {}
    return PayrollRunSummary(
        id=run.id,
        month=run.month,
        year=run.year,
        status=run.status,
        employee_count=meta.get("employee_count", 0),
        net_payable=meta.get("total_net_payable", 0.0),
        skipped=meta.get("skipped", []),
        approved_at=run.approved_at,
    )
```

#### 4 new endpoints (add after the existing `download_payroll_export` endpoint)

**GET /payroll/runs**
```python
@router.get("/runs", dependencies=[Depends(require_permissions("payroll:view"))])
def list_payroll_runs(db: Session = Depends(get_db)) -> list[PayrollRunSummary]:
    runs = db.scalars(
        select(PayrollRun)
        .where(PayrollRun.deleted_at.is_(None))
        .order_by(PayrollRun.year.desc(), PayrollRun.month.desc())
    ).all()
    return [_run_to_summary(run) for run in runs]
```

**POST /payroll/runs**
```python
@router.post("/runs", dependencies=[Depends(require_permissions("payroll:manage"))])
def generate_payroll_run(
    payload: PayrollRunCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PayrollRunSummary:
    existing = db.scalar(
        select(PayrollRun)
        .where(PayrollRun.month == payload.month, PayrollRun.year == payload.year)
        .where(PayrollRun.deleted_at.is_(None))
    )
    if existing and existing.status != PayrollRunStatus.DRAFT:
        raise HTTPException(400, f"Payroll for {payload.month}/{payload.year} is {existing.status}. Cannot regenerate.")

    line_items, skipped = compute_payroll_run(db, payload.month, payload.year)

    if existing:
        db.execute(delete(PayrollRunItem).where(PayrollRunItem.payroll_run_id == existing.id))
        run = existing
    else:
        run = PayrollRun(month=payload.month, year=payload.year, generated_by=current_user.id)
        db.add(run)
        db.flush()

    net_payable = 0.0
    for item_data in line_items:
        net_payable += float(item_data.get("net_salary", 0))
        db.add(PayrollRunItem(payroll_run_id=run.id, **item_data))

    run.status = PayrollRunStatus.DRAFT
    run.metadata_json = {
        "skipped": skipped,
        "total_net_payable": net_payable,
        "employee_count": len(line_items),
    }
    db.commit()
    db.refresh(run)
    return _run_to_summary(run)
```

**POST /payroll/runs/{run_id}/submit-approval**
```python
@router.post("/runs/{run_id}/submit-approval", dependencies=[Depends(require_permissions("payroll:manage"))])
def submit_payroll_for_approval(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PayrollRunSummary:
    run = _get_run_or_404(db, run_id)
    if run.status != PayrollRunStatus.DRAFT:
        raise HTTPException(400, f"Only DRAFT runs can be submitted. Current status: {run.status}")
    run.status = PayrollRunStatus.PENDING_APPROVAL
    meta = run.metadata_json or {}
    ApprovalEngineService(db).create_approval(
        module_name="payroll",
        action_name="approve_payroll_run",
        payload_json={
            "payroll_run_id": str(run.id),
            "month": run.month,
            "year": run.year,
            "total_employees": meta.get("employee_count", 0),
            "total_net_payable": meta.get("total_net_payable", 0.0),
        },
        approval_reason="Payroll run requires finance approval before bank sheet export.",
        requested_by=current_user.id,
        workflow_id=str(run.id),
    )
    db.commit()
    return _run_to_summary(run)
```

**POST /payroll/runs/{run_id}/export**
```python
@router.post("/runs/{run_id}/export", dependencies=[Depends(require_permissions("payroll:view"))])
def export_payroll_sheet(
    run_id: UUID,
    payload: PayrollExportRequest,
    db: Session = Depends(get_db),
) -> dict:
    run = _get_run_or_404(db, run_id)
    if payload.type == "bank" and run.status not in {
        PayrollRunStatus.APPROVED, PayrollRunStatus.BANK_SHEET_GENERATED, PayrollRunStatus.COMPLETED
    }:
        raise HTTPException(400, "Bank sheet requires approved payroll. Submit for approval first.")

    company = db.scalar(
        select(CompanySettings)
        .where(CompanySettings.active == True)
        .where(CompanySettings.deleted_at.is_(None))
    )
    generators = {
        "employee": generate_employee_sheet,
        "consultant": generate_consultant_sheet,
        "bank": generate_bank_sheet,
        "tds": generate_tds_sheet,
    }
    filename = generators[payload.type](db, run, company)

    if payload.type == "bank" and run.status == PayrollRunStatus.APPROVED:
        run.status = PayrollRunStatus.BANK_SHEET_GENERATED
        db.commit()

    return {"filename": filename, "download_url": f"/api/v1/payroll/export/{filename}"}
```

---

## Frontend Changes

### 4. Add to `frontend/src/services/payroll.ts`

Add these after the existing `getEmployeeTDSConfigs` function, replacing the comment block. Use the same `apiGet / apiPost` pattern as all existing functions:

```typescript
export type PayrollRunSummary = {
  id: string;
  month: number;
  year: number;
  status: string;
  employee_count: number;
  net_payable: number;
  skipped: string[];
  approved_at: string | null;
};

export function getPayrollRuns() {
  return apiGet<PayrollRunSummary[]>("/payroll/runs");
}

export function generatePayrollRun(month: number, year: number) {
  return apiPost<PayrollRunSummary>("/payroll/runs", { month, year });
}

export function submitPayrollApproval(runId: string) {
  return apiPost<PayrollRunSummary>(`/payroll/runs/${runId}/submit-approval`, {});
}

export function exportPayrollSheet(runId: string, type: "employee" | "consultant" | "bank" | "tds") {
  return apiPost<{ filename: string; download_url: string }>(`/payroll/runs/${runId}/export`, { type });
}
```

### 5. Update `frontend/src/pages/PayrollPage.tsx`

Add a **Payroll Runs** section as the FIRST section of the page (above Salary Structures / Components). The `PayrollRunCard` and `PayrollExportDownload` components exist — just import and wire them.

#### New imports to add
```typescript
import { useQuery } from "@tanstack/react-query";
import { getPayrollRuns, generatePayrollRun, submitPayrollApproval, exportPayrollSheet, PayrollRunSummary } from "@/services/payroll";
import PayrollRunCard from "@/components/payroll/PayrollRunCard";
import PayrollExportDownload from "@/components/payroll/PayrollExportDownload";
```

#### New state + handlers (inside the component, alongside existing state)
```typescript
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_OPTIONS = MONTH_NAMES.map((label, i) => ({ value: i + 1, label }));
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
const [isGenerating, setIsGenerating] = useState(false);
const [exportResults, setExportResults] = useState<Record<string, { title: string; filename: string; download_url: string }>>({});

const { data: runs = [], refetch: refetchRuns } = useQuery({
  queryKey: ["payroll-runs"],
  queryFn: getPayrollRuns,
});

async function handleGenerate() {
  setIsGenerating(true);
  try {
    await generatePayrollRun(selectedMonth, selectedYear);
    await refetchRuns();
  } finally {
    setIsGenerating(false);
  }
}

async function handleSubmitApproval(runId: string) {
  await submitPayrollApproval(runId);
  await refetchRuns();
}

async function handleExport(runId: string, type: "employee" | "consultant" | "bank" | "tds") {
  const result = await exportPayrollSheet(runId, type);
  const typeLabels = { employee: "Employee Sheet", consultant: "Consultant Sheet", bank: "Bank Sheet", tds: "TDS Sheet" };
  setExportResults(prev => ({ ...prev, [runId]: { title: typeLabels[type], ...result } }));
}
```

#### New JSX section (insert before the existing Salary Structures section)
```tsx
<SectionCard title="Payroll Runs" icon={<FileSpreadsheet />}>
  <div className="flex items-center gap-3 mb-4">
    <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
            className="rounded-md border px-3 py-2 text-sm">
      {MONTH_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
    </select>
    <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
            className="rounded-md border px-3 py-2 text-sm">
      {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
    <Button onClick={handleGenerate} disabled={isGenerating}>
      {isGenerating ? "Generating..." : "Generate Payroll"}
    </Button>
  </div>

  {runs.length === 0 ? (
    <p className="text-sm text-muted-foreground">No payroll runs yet. Select a month and click Generate.</p>
  ) : (
    <div className="space-y-4">
      {runs.map(run => (
        <div key={run.id} className="space-y-3">
          <PayrollRunCard
            runId={run.id}
            month={`${MONTH_NAMES[run.month - 1]} ${run.year}`}
            status={run.status}
            employeeCount={run.employee_count}
            skipped={run.skipped}
            exportsLocked={!["APPROVED", "BANK_SHEET_GENERATED", "COMPLETED"].includes(run.status)}
            onExport={(type) => handleExport(run.id, type)}
            onSubmitApproval={run.status === "DRAFT" ? () => handleSubmitApproval(run.id) : undefined}
          />
          {exportResults[run.id] && (
            <PayrollExportDownload
              title={exportResults[run.id].title}
              filename={exportResults[run.id].filename}
              downloadUrl={exportResults[run.id].download_url}
            />
          )}
        </div>
      ))}
    </div>
  )}
</SectionCard>
```

---

## Remaining Work (Ordered)

## Files to Change

```
MODIFIED BACKEND:
  backend/requirements.txt                          (DONE — openpyxl already added)
  backend/app/models/payroll/models.py              (DONE — metadata_json already added)
  backend/app/api/v1/endpoints/payroll.py           (+imports, +schemas, +2 helpers, +4 endpoints)

NEW BACKEND:
  backend/alembic/versions/20260801_0036_payroll_run_metadata.py

MODIFIED FRONTEND:
  frontend/src/services/payroll.ts                  (+PayrollRunSummary type, +4 API functions, remove comment block)
  frontend/src/pages/PayrollPage.tsx                (+PayrollRuns section at top)
```

---

## Verification

- [ ] `alembic upgrade head` — confirms `20260801_0036` applied, `metadata_json` column exists on `payroll_runs`
- [ ] `POST /payroll/runs {month:7, year:2026}` → 200 with run summary JSON, `payroll_run_items` rows created in DB
- [ ] `GET /payroll/runs` → list including the generated run with correct employee_count / skipped
- [ ] Payroll page shows month/year picker + Generate button at top
- [ ] Clicking Generate → run card appears with employee count + skipped names
- [ ] Employee / Consultant / TDS sheet download works from DRAFT status
- [ ] Bank sheet button disabled until approved (exportsLocked)
- [ ] Submit for Approval → status changes to PENDING_APPROVAL, `approval_requests` row created in DB
