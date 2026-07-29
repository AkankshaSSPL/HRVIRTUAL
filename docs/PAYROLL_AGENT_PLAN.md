# Payroll Agent — Full Implementation Plan

**Status:** Plan only — not yet implemented  
**Branch:** `main`  
**Source:** `docs/Payroll Sample Sheets.xlsx` (4 sheets analysed)  
**Estimated effort:** ~20 hrs / 2.5 days

---

## What Currently Exists vs What's Missing

| Exists | Missing |
|---|---|
| `PayrollRun` model with `DRAFT→COMPLETED` status enum | Payroll generation logic (currently returns "NOT AVAILABLE") |
| `PayrollRunItem` (gross, net, bank details only) | `breakdown_json` column for component-level detail |
| `SalaryComponent` + `SalaryStructure` + `SalaryStructureItem` | `PayrollConfig` — statutory rates (EPF%, PT slabs, consultant TDS%) |
| `EmployeeSalaryAssignment` (employee ↔ structure) | `CompanySettings` — company name, bank account (for sheet headers) |
| `ApprovalRequest` engine (already wired) | `EmployeeTDSConfig` — per-employee annual TDS from CA |
| `PayrollRunStatus.PENDING_APPROVAL` enum | Computation engine + XLSX export service |

---

## Business Rules (Extracted from Sheet Formulas)

### Full-Time Employees — Salary Structure Based

Computed from the employee's assigned `SalaryStructure`. Components evaluated in `sort_order`:

| Component | Type | How evaluated |
|---|---|---|
| BASIC | EARNING | `gross_salary × 40%` (PERCENTAGE of GROSS) |
| HRA | EARNING | `BASIC × 60%` (PERCENTAGE of BASIC) |
| CONVEYANCE | EARNING | `BASIC × 50%` |
| EDUCATION | EARNING | `BASIC × 10%` |
| MEDICAL | EARNING | `gross - BASIC - HRA - CA - EduA - EmployerPF - EPF` (FORMULA, residual) |
| EMPLOYER_PF | EMPLOYER_CONTRIBUTION | `MIN(BASIC, epf_wage_cap) × epf_employer_rate` from PayrollConfig |
| EPF | DEDUCTION | `MIN(BASIC, epf_wage_cap) × epf_employee_rate` from PayrollConfig |
| PROFESSIONAL_TAX | DEDUCTION | Slab lookup from PayrollConfig (0 / 175 / 200) |
| TDS | DEDUCTION | `EmployeeTDSConfig.monthly_tds` for the financial year |

**Pro-rating:** `component_value × (days_worked / working_days)` for all EARNING components.  
**Rounding:** ROUND_HALF_UP to nearest rupee for all components.

### Consultant Employees — Fee Based

| Component | Formula |
|---|---|
| Monthly Fee | `employee.current_salary` |
| Leave Deduction | `IF(days < base_days, fee × (base_days - days) / base_days, 0)` |
| Extra Working Pay | `IF(days > base_days, fee × (days - base_days) / base_days, 0)` |
| TDS | `FLOOR(actual_pay × consultant_tds_rate)` — floor, not round (statutory) |
| Net Pay | `actual_pay - TDS` |

`base_days` and `consultant_tds_rate` from `PayrollConfig`. Nothing hardcoded.

---

## New Masters Required

### Master 1 — `PayrollConfig`

**File:** `backend/app/models/payroll/models.py`

```python
class PayrollConfig(BaseModel):
    __tablename__ = "payroll_configs"

    epf_wage_cap: Mapped[int] = mapped_column(Integer, nullable=False, default=15000)
    epf_employee_rate: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False, default=Decimal("0.1200"))
    epf_employer_rate: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False, default=Decimal("0.1361"))

    # Maharashtra PT slabs as JSON:
    # [{"min": 0, "max": 7499, "amount": 0},
    #  {"min": 7500, "max": 9999, "amount": 175},
    #  {"min": 10000, "max": null, "amount": 200}]
    professional_tax_slabs: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    consultant_tds_rate: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False, default=Decimal("0.1000"))
    consultant_base_working_days: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    employee_base_working_days: Mapped[int] = mapped_column(Integer, nullable=False, default=26)

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
```

### Master 2 — `CompanySettings`

```python
class CompanySettings(BaseModel):
    __tablename__ = "company_settings"

    company_name: Mapped[str] = mapped_column(String(240), nullable=False)
    company_pan: Mapped[str | None] = mapped_column(String(20), nullable=True)
    company_tan: Mapped[str | None] = mapped_column(String(20), nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    payroll_bank_account: Mapped[str | None] = mapped_column(String(80), nullable=True)
    payroll_bank_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    payroll_bank_ifsc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address_line1: Mapped[str | None] = mapped_column(String(240), nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
```

### Master 3 — `EmployeeTDSConfig`

```python
class EmployeeTDSConfig(BaseModel):
    __tablename__ = "employee_tds_configs"

    employee_id: Mapped[UUID] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    financial_year: Mapped[str] = mapped_column(String(10), nullable=False)  # "2026-27"
    monthly_tds: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    annual_tax_liability: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    tax_regime: Mapped[str | None] = mapped_column(String(10), nullable=True)  # "NEW" | "OLD"
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    employee: Mapped["Employee"] = relationship("Employee")

    __table_args__ = (
        UniqueConstraint("employee_id", "financial_year", "effective_from",
                         name="uq_employee_tds_config"),
    )
```

### Master 4 — Extend `PayrollRunItem`

Add to existing model:
```python
breakdown_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
```

**Breakdown JSON structure (FULL_TIME):**
```json
{
  "employment_type": "FULL_TIME",
  "salary_structure_code": "STANDARD",
  "days_worked": 26, "working_days": 26, "lop_days": 0, "pro_rate_ratio": 1.0,
  "gross_salary": 200000,
  "earnings": { "BASIC": 80000, "HRA": 48000, "CONVEYANCE": 40000, "EDUCATION": 8000, "MEDICAL": 11958 },
  "employer_contributions": { "EMPLOYER_PF": 2042 },
  "statutory_deductions": { "EPF": 1800, "PROFESSIONAL_TAX": 200, "TDS": 8125 },
  "other_deductions": { "VPF": 0, "INSURANCE": 0, "ADVANCE": 0 },
  "gross_earnings": 187958, "total_deductions": 10125, "net_salary": 177833
}
```

**Breakdown JSON structure (CONSULTANT):**
```json
{
  "employment_type": "CONSULTANT",
  "monthly_fee": 100000, "days_worked": 18, "base_working_days": 20,
  "leave_deduction": 10000, "extra_working_pay": 0,
  "arrears": 0, "insurance_premium": 0, "advance_deduction": 0,
  "actual_pay": 90000, "tds_rate": 0.10, "tds": 9000, "net_salary": 81000
}
```

---

## Alembic Migration

**File:** `backend/alembic/versions/20260729_0034_payroll_masters.py`

```python
"""Add payroll_configs, company_settings, employee_tds_configs, breakdown_json on payroll_run_items

Revision ID: 20260729_0034
Revises: 20260729_0033
"""
revision: str = "20260729_0034"
down_revision: str = "20260729_0033"

def upgrade() -> None:
    # payroll_configs
    op.create_table("payroll_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("epf_wage_cap", sa.Integer(), nullable=False, server_default="15000"),
        sa.Column("epf_employee_rate", sa.Numeric(6, 4), nullable=False, server_default="0.1200"),
        sa.Column("epf_employer_rate", sa.Numeric(6, 4), nullable=False, server_default="0.1361"),
        sa.Column("professional_tax_slabs", postgresql.JSONB(), nullable=True),
        sa.Column("consultant_tds_rate", sa.Numeric(6, 4), nullable=False, server_default="0.1000"),
        sa.Column("consultant_base_working_days", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("employee_base_working_days", sa.Integer(), nullable=False, server_default="26"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.PrimaryKeyConstraint("id"),
    )

    # company_settings
    op.create_table("company_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("company_name", sa.String(240), nullable=False),
        sa.Column("company_pan", sa.String(20), nullable=True),
        sa.Column("company_tan", sa.String(20), nullable=True),
        sa.Column("gstin", sa.String(20), nullable=True),
        sa.Column("payroll_bank_account", sa.String(80), nullable=True),
        sa.Column("payroll_bank_name", sa.String(120), nullable=True),
        sa.Column("payroll_bank_ifsc", sa.String(20), nullable=True),
        sa.Column("address_line1", sa.String(240), nullable=True),
        sa.Column("city", sa.String(80), nullable=True),
        sa.Column("state", sa.String(80), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.PrimaryKeyConstraint("id"),
    )

    # employee_tds_configs
    op.create_table("employee_tds_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("financial_year", sa.String(10), nullable=False),
        sa.Column("monthly_tds", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("annual_tax_liability", sa.Numeric(14, 2), nullable=True),
        sa.Column("tax_regime", sa.String(10), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("employee_id", "financial_year", "effective_from",
                            name="uq_employee_tds_config"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_employee_tds_configs_employee_fy",
                    "employee_tds_configs", ["employee_id", "financial_year"])

    # breakdown_json on existing payroll_run_items
    op.add_column("payroll_run_items",
        sa.Column("breakdown_json", postgresql.JSONB(), nullable=True))

    # Seed default PayrollConfig (Maharashtra rates)
    op.execute("""
        INSERT INTO payroll_configs (
            id, epf_wage_cap, epf_employee_rate, epf_employer_rate,
            professional_tax_slabs, consultant_tds_rate,
            consultant_base_working_days, employee_base_working_days, active
        ) VALUES (
            gen_random_uuid(), 15000, 0.1200, 0.1361,
            '[
                {"min": 0,     "max": 7499,  "amount": 0},
                {"min": 7500,  "max": 9999,  "amount": 175},
                {"min": 10000, "max": null,  "amount": 200}
            ]'::jsonb,
            0.1000, 20, 26, true
        )
    """)

def downgrade() -> None:
    op.drop_column("payroll_run_items", "breakdown_json")
    op.drop_index("ix_employee_tds_configs_employee_fy", "employee_tds_configs")
    op.drop_table("employee_tds_configs")
    op.drop_table("company_settings")
    op.drop_table("payroll_configs")
```

---

## Backend Services

### `backend/app/services/payroll_config_service.py`

```python
class PayrollConfigService:
    def __init__(self, db: Session): self.db = db

    def get(self) -> PayrollConfig:
        config = self.db.scalar(
            select(PayrollConfig)
            .where(PayrollConfig.active == True)
            .where(PayrollConfig.deleted_at.is_(None))
        )
        if not config:
            raise RuntimeError("No active PayrollConfig. Run migration or create one in Masters.")
        return config

    def get_professional_tax(self, monthly_basic: float) -> int:
        slabs = self.get().professional_tax_slabs or []
        for slab in sorted(slabs, key=lambda s: s["min"], reverse=True):
            if monthly_basic >= slab["min"] and (slab["max"] is None or monthly_basic <= slab["max"]):
                return int(slab["amount"])
        return 0
```

### `backend/app/services/payroll_computation.py`

Key functions (full implementations in code — summarised here):

```python
def _rupee(value) -> int:
    """ROUND_HALF_UP to nearest rupee."""
    return int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

def _floor_rupee(value) -> int:
    """FLOOR to rupee — used for consultant TDS per statutory requirement."""
    return int(math.floor(float(value)))

def get_monthly_tds(db, employee_id, month, year) -> Decimal:
    """Get TDS from EmployeeTDSConfig for the financial year.
    Returns 0 if no config — HR must add per employee when CA provides workings."""
    fy_start = year if month >= 4 else year - 1
    financial_year = f"{fy_start}-{str(fy_start + 1)[-2:]}"
    config = db.scalar(
        select(EmployeeTDSConfig)
        .where(EmployeeTDSConfig.employee_id == employee_id)
        .where(EmployeeTDSConfig.financial_year == financial_year)
        .where(EmployeeTDSConfig.effective_from <= date(year, month, 1))
        .where(EmployeeTDSConfig.deleted_at.is_(None))
        .order_by(EmployeeTDSConfig.effective_from.desc())
    )
    return config.monthly_tds if config else Decimal("0")

def get_attendance_days(db, employee_id, month, year) -> int | None:
    """Count PRESENT + WFH + ON_DUTY days. HALF_DAY = 0.5.
    Returns None if no attendance records exist — caller defaults to working_days."""
    result = db.scalar(
        select(func.sum(case((AttendanceRecord.status == "HALF_DAY", 0.5), else_=1)))
        .where(AttendanceRecord.employee_id == employee_id)
        .where(extract("month", AttendanceRecord.attendance_date) == month)
        .where(extract("year", AttendanceRecord.attendance_date) == year)
        .where(AttendanceRecord.status.in_(["PRESENT", "WORK_FROM_HOME", "ON_DUTY", "HALF_DAY"]))
        .where(AttendanceRecord.deleted_at.is_(None))
    )
    return int(result) if result is not None else None

def evaluate_component(item, component, resolved: dict, gross: float) -> float:
    """Evaluate a SalaryStructureItem to a rupee amount.
    FIXED  → calculation_value
    PERCENTAGE → (reference_component or gross) × calculation_value / 100
    FORMULA → eval() with resolved dict (safe: no builtins)
    """
    calc_type = (item.calculation_type or component.calculation_type or "").upper()
    val = float(item.calculation_value or component.calculation_value or 0)
    ref = item.reference_component_code or component.reference_component_code
    if calc_type == "FIXED":
        return val
    elif calc_type == "PERCENTAGE":
        base = resolved.get(ref, gross) if ref else gross
        return base * (val / 100.0)
    elif calc_type == "FORMULA":
        formula = item.formula or component.formula or ""
        safe_env = {**resolved, "GROSS": gross, "CTC": gross}
        try: return float(eval(formula, {"__builtins__": {}}, safe_env))
        except Exception: return 0.0
    return 0.0

def compute_for_employee(db, employee, config, month, year) -> dict | None:
    """Dispatch to full_time or consultant compute. Returns None if employee should be skipped."""
    if employee.employment_type == EmploymentType.FULL_TIME:
        return _compute_fulltime(db, employee, config, month, year)
    return _compute_consultant(db, employee, config, month, year)

def _compute_fulltime(db, employee, config, month, year) -> dict | None:
    # 1. Get active salary assignment
    assignment = get_active_assignment(db, employee.id, month, year)
    if not assignment or not employee.bank_account_number:
        return None

    # 2. Load structure items in sort_order
    structure = db.get(SalaryStructure, assignment.salary_structure_id)
    items = sorted(structure.items, key=lambda x: x.sort_order)
    gross = float(assignment.gross_salary)

    # 3. Evaluate each component
    resolved, earnings, employer_contribs = {"CTC": gross, "GROSS": gross}, {}, {}
    for item in items:
        component = get_component(db, item.component_code)
        if not component: continue
        raw = evaluate_component(item, component, resolved, gross)
        resolved[item.component_code] = raw
        t = (component.type or "").upper()
        if t == "EARNING":
            earnings[item.component_code] = raw
        elif t == "EMPLOYER_CONTRIBUTION":
            employer_contribs[item.component_code] = _rupee(raw)

    # 4. Pro-rate earnings for LOP
    working_days = config.employee_base_working_days
    days_worked = get_attendance_days(db, employee.id, month, year) or working_days
    ratio = days_worked / working_days
    lop_days = max(0, working_days - days_worked)
    earnings = {k: _rupee(v * ratio) for k, v in earnings.items()}

    # 5. Statutory deductions from PayrollConfig (never hardcoded)
    basic = float(earnings.get("BASIC", 0))
    epf_wages = min(basic, float(config.epf_wage_cap))
    epf = _rupee(epf_wages * float(config.epf_employee_rate))
    employer_pf = _rupee(epf_wages * float(config.epf_employer_rate))
    pt = PayrollConfigService(db).get_professional_tax(basic)
    tds = int(get_monthly_tds(db, employee.id, month, year))

    gross_earnings = sum(earnings.values())
    total_deductions = epf + pt + tds
    return {
        "employment_type": "FULL_TIME",
        "salary_structure_code": structure.code,
        "days_worked": days_worked, "working_days": working_days,
        "lop_days": lop_days, "pro_rate_ratio": round(ratio, 4),
        "gross_salary": gross, "earnings": earnings,
        "employer_contributions": {"EMPLOYER_PF": employer_pf, **employer_contribs},
        "statutory_deductions": {"EPF": epf, "PROFESSIONAL_TAX": pt, "TDS": tds},
        "other_deductions": {},
        "gross_earnings": gross_earnings,
        "total_deductions": total_deductions,
        "net_salary": gross_earnings - total_deductions,
    }

def _compute_consultant(db, employee, config, month, year) -> dict | None:
    if not employee.bank_account_number or not employee.current_salary:
        return None
    fee = float(employee.current_salary)
    base = config.consultant_base_working_days
    tds_rate = float(config.consultant_tds_rate)
    days = get_attendance_days(db, employee.id, month, year) or base

    leave_ded = _rupee(fee * (base - days) / base) if days < base else 0
    extra_pay = _rupee(fee * (days - base) / base) if days > base else 0
    actual_pay = _rupee(fee) - leave_ded + extra_pay
    tds = _floor_rupee(actual_pay * tds_rate)  # FLOOR — statutory
    return {
        "employment_type": "CONSULTANT",
        "monthly_fee": fee, "days_worked": days, "base_working_days": base,
        "leave_deduction": leave_ded, "extra_working_pay": extra_pay,
        "arrears": 0, "insurance_premium": 0, "advance_deduction": 0,
        "actual_pay": actual_pay, "tds_rate": tds_rate, "tds": tds,
        "net_salary": actual_pay - tds,
    }
```

### `backend/app/services/payroll_export.py`

Four generators — all take `(db, payroll_run, company: CompanySettings)`:

```
generate_employee_sheet  → Employee Salary Sheet XLSX (FULL_TIME)
generate_consultant_sheet → Consultant Sheet XLSX (CONSULTANT)
generate_bank_sheet      → Bank upload XLSX (all employees, debit account from CompanySettings)
generate_tds_sheet       → Two-tab XLSX: Employee TDS + Consultant TDS with PAN
```

All sheet headers read from `CompanySettings.company_name`.  
Bank debit account reads from `CompanySettings.payroll_bank_account`.  
All rates/amounts read from `breakdown_json` columns — no recomputation needed.

---

## Approval Flow

### Status transitions

```
generate payroll → DRAFT
submit for approval → PENDING_APPROVAL + ApprovalRequest created
finance approves → APPROVED (exports unlocked, bank sheet available)
bank sheet exported → BANK_SHEET_GENERATED
mark paid → COMPLETED
```

### Code for `_submit_for_approval()`

```python
def _submit_for_approval(self, run: PayrollRun, user_id: UUID) -> dict:
    """Submit DRAFT payroll for finance approval.

    Manual trigger: HR clicks "Submit for Approval" button in UI.
    # TODO (future): connect to agent command
    #   "submit payroll for July for approval"
    #   Wire: PayrollAgent.execute(action="submit_approval", ...)
    #   Add to TriageAgent TRIAGE_TOOLS route_to_payroll description
    """
    run.status = PayrollRunStatus.PENDING_APPROVAL
    approval = ApprovalEngineService(self.db).create_approval(
        module_name="payroll",
        action_name="approve_payroll_run",
        payload_json={
            "payroll_run_id": str(run.id),
            "month": run.month, "year": run.year,
            "total_employees": len(run.items),
            "total_net_payable": float(sum(i.net_salary for i in run.items)),
        },
        approval_reason="Payroll run requires finance approval before bank sheet export.",
        requested_by=user_id,
        workflow_id=str(run.id),
        workflow_state_json=None,
    )
    self.db.commit()
    ...
```

---

## PayrollAgent Updated Actions

**File:** `backend/app/agents/payroll_agent/service.py`

```python
supported_actions = [
    "process",            # generate payroll run for a month (→ DRAFT)
    "export",             # generate XLSX + return download URL
    "inspect",            # show payroll summary in chat
    "inspect_components", "create_component", "update_component", "delete_component",
    # NOTE: "submit_approval" wired manually via UI button for now
    # TODO: add "submit_approval" to supported_actions when agent command is wired
]
```

---

## API Endpoints

**File:** `backend/app/api/v1/endpoints/payroll.py`

Add these endpoints:

```python
# Download generated XLSX
GET /payroll/export/{filename}
→ FileResponse, auth required, validates filename with regex to prevent path traversal

# PayrollConfig CRUD (Masters page)
GET  /payroll/config           → current active config
PUT  /payroll/config           → update rates (admin only)

# CompanySettings CRUD (Masters page)
GET  /payroll/company-settings
PUT  /payroll/company-settings

# EmployeeTDSConfig per employee
GET  /employees/{id}/tds-config
POST /employees/{id}/tds-config
PUT  /employees/{id}/tds-config/{config_id}
```

---

## Frontend — UI Components

### Design rules (match existing project exactly)

- Agent theme: **payroll = emerald** (from `agent-theme.ts`)
- Card wrapper: `cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)`
- Icon wrapper: `cn("flex h-9 w-9 items-center justify-center rounded-md border", theme.icon)`
- Status colors: emerald=APPROVED, amber=PENDING_APPROVAL, slate=DRAFT, rose=FAILED
- Imports: `cn` from `@/lib/utils`, `useAgentTheme` from `@/lib/agent-theme`
- Components: `Button`, `Badge` from `@/components/ui`, `PageContainer`, `PageHeader`, `AppLayout`, `StatusBadge`, `EmptyState`, `DrawerPanel` from `@/components/ui-system`
- Icons: lucide-react (`Download`, `FileSpreadsheet`, `CheckCircle`, `Clock`, `Building2`, `Settings`)

---

### New reusable components

#### `frontend/src/components/payroll/PayrollRunCard.tsx`

Reusable card showing a single payroll run status — used on PayrollPage and in chat.

```tsx
import { cn } from "@/lib/utils";
import { useAgentTheme } from "@/lib/agent-theme";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui-system/StatusBadge";
import { Download, FileSpreadsheet, CheckCircle, Clock } from "lucide-react";

interface PayrollRunCardProps {
  runId: string;
  month: string;        // "July 2026"
  status: string;       // "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | ...
  employeeCount: number;
  skipped?: string[];
  exportsLocked: boolean;
  onExport: (type: "employee" | "consultant" | "bank" | "tds") => void;
  onSubmitApproval?: () => void;   // undefined hides the button
}

const STATUS_LABELS: Record<string, { label: string; tone: "success" | "warning" | "neutral" | "error" }> = {
  DRAFT:              { label: "Draft",            tone: "neutral" },
  PENDING_APPROVAL:   { label: "Pending Approval", tone: "warning" },
  APPROVED:           { label: "Approved",         tone: "success" },
  BANK_SHEET_GENERATED: { label: "Bank Sheet Sent", tone: "success" },
  COMPLETED:          { label: "Completed",        tone: "success" },
};

export function PayrollRunCard({
  runId, month, status, employeeCount, skipped = [],
  exportsLocked, onExport, onSubmitApproval,
}: PayrollRunCardProps) {
  const theme = useAgentTheme("payroll");
  const statusInfo = STATUS_LABELS[status] ?? { label: status, tone: "neutral" };

  const exports = [
    { type: "employee" as const, label: "Employee Sheet" },
    { type: "consultant" as const, label: "Consultant Sheet" },
    { type: "tds" as const, label: "TDS Sheet" },
    { type: "bank" as const, label: "Bank Sheet", requiresApproval: true },
  ];

  return (
    <div className={cn("space-y-4 rounded-lg border p-4 shadow-sm", theme.soft)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", theme.icon)}>
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold">{month} Payroll</p>
            <p className="text-xs text-muted-foreground">{employeeCount} employees processed</p>
          </div>
        </div>
        <StatusBadge status={statusInfo.label} tone={statusInfo.tone} />
      </div>

      {/* Skipped employees warning */}
      {skipped.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <span className="font-medium">Skipped ({skipped.length}):</span>{" "}
          {skipped.join(", ")}
        </div>
      )}

      {/* Export buttons */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Export Sheets</p>
        <div className="flex flex-wrap gap-2">
          {exports.map((exp) => {
            const locked = exp.requiresApproval && exportsLocked;
            return (
              <Button
                key={exp.type}
                size="sm"
                variant="outline"
                disabled={locked}
                onClick={() => !locked && onExport(exp.type)}
                className={cn(locked && "opacity-40")}
              >
                <Download className="h-3 w-3 mr-1.5" />
                {exp.label}
                {locked && (
                  <span className="ml-1.5 rounded-sm bg-amber-100 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    Needs Approval
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Submit for approval CTA */}
      {status === "DRAFT" && onSubmitApproval && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Review payroll and submit to finance for approval.
          </p>
          <Button size="sm" onClick={onSubmitApproval}>
            <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
            Submit for Approval
          </Button>
        </div>
      )}

      {status === "PENDING_APPROVAL" && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Awaiting finance approval. Bank sheet will unlock after approval.
        </div>
      )}
    </div>
  );
}
```

---

#### `frontend/src/components/payroll/PayrollExportDownload.tsx`

Shown in chat after export is generated.

```tsx
import { cn } from "@/lib/utils";
import { useAgentTheme } from "@/lib/agent-theme";
import { Download, FileSpreadsheet } from "lucide-react";

interface PayrollExportDownloadProps {
  title: string;
  filename: string;
  downloadUrl: string;
}

export function PayrollExportDownload({ title, filename, downloadUrl }: PayrollExportDownloadProps) {
  const theme = useAgentTheme("payroll");
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

  return (
    <div className={cn("flex items-center justify-between gap-4 rounded-lg border p-3 shadow-sm", theme.soft)}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", theme.icon)}>
          <FileSpreadsheet className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{filename}</p>
        </div>
      </div>
      <a
        href={`${apiBase}${downloadUrl}`}
        download={filename}
        className="shrink-0"
      >
        <button className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-muted">
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </a>
    </div>
  );
}
```

---

#### `frontend/src/components/payroll/PayrollConfigPanel.tsx`

Used on the Masters page to view and edit payroll statutory rates.

```tsx
// Displays current PayrollConfig with inline edit.
// Matches the existing Masters page pattern: SectionCard + labeled rows.
import { SectionCard } from "@/components/ui-system/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings } from "lucide-react";

// Renders each rate as:
// [Label]           [Value or Input field]    [Edit / Save]
// EPF Wage Cap      ₹15,000                  (pencil icon)
// Employee EPF      12.00%
// Employer PF       13.61%
// Consultant TDS    10.00%
// Consultant Days   20 days/month
// PT Slabs          table with min/max/amount rows

// On edit: switches to input mode per field.
// On save: calls PUT /api/v1/payroll/config
// Error states: inline below field using text-destructive text-xs
```

---

#### `frontend/src/components/payroll/CompanySettingsPanel.tsx`

Used on the Masters page (Organization tab) to view/edit company details.

```tsx
// Two-column grid of labeled fields:
// Company Name   [Input]
// PAN            [Input]
// TAN            [Input]
// GSTIN          [Input]
// Bank A/C       [Input]
// Bank Name      [Input]
// IFSC           [Input]
// Address        [Input]
// City / State   [Input] [Input]

// Save: PUT /api/v1/payroll/company-settings
// Follows existing Masters page input pattern (same as Departments/Designations forms)
```

---

#### `frontend/src/components/payroll/EmployeeTDSModal.tsx`

Modal to add/update TDS config for a single employee. Opened from employee profile.

```tsx
// Uses DrawerPanel (existing component) with:
// - Financial Year selector (dropdown: "2026-27", "2025-26")
// - Monthly TDS Amount (numeric input, ₹ prefix)
// - Annual Tax Liability (optional)
// - Tax Regime (NEW / OLD toggle)
// - Effective From (date picker)
// - Remarks (textarea)
// Save: POST /api/v1/employees/{id}/tds-config
// Uses existing DrawerPanel pattern from EmployeeEditDrawer.tsx
```

---

### AgentCommandPage.tsx additions

In the `BusinessResponse` component, add two new cases:

```tsx
// Case: payroll_summary — shown after "generate payroll for July"
case "payroll_summary": {
  const { title, run_id, status, employee_count, skipped, exports_locked } = sr;
  import calendar month_name from run month
  return (
    <PayrollRunCard
      runId={run_id}
      month={title.replace("Payroll Draft — ", "").replace("Payroll — ", "")}
      status={status}
      employeeCount={employee_count}
      skipped={skipped}
      exportsLocked={exports_locked}
      onExport={(type) => {
        // Sends agent command to trigger export
        // TODO: replace with direct API call when wired
        onSend(`download ${type} sheet for ${month_label} payroll`);
      }}
      onSubmitApproval={
        status === "DRAFT"
          ? () => {
              // TODO: wire to agent command when submit_approval action is implemented
              // For now: direct API call or approval inbox
              console.info("TODO: connect submit approval flow");
            }
          : undefined
      }
    />
  );
}

// Case: payroll_export — shown after "download employee/bank sheet"
case "payroll_export": {
  return (
    <PayrollExportDownload
      title={sr.title}
      filename={sr.filename}
      downloadUrl={sr.download_url}
    />
  );
}
```

---

### PayrollPage.tsx (new page)

```tsx
// Route: /payroll
// Pattern: AppLayout > PageContainer > PageHeader + content

// PageHeader:
//   title="Payroll"
//   description="Generate, review and export monthly payroll"
//   actions=[Generate Payroll button (opens month picker modal)]

// Content:
//   If no runs: EmptyState (FileSpreadsheet icon, "No payroll runs yet")
//   If runs exist: list of PayrollRunCard components, newest first

// Each PayrollRunCard links to /payroll/{run_id} for detail view
// The detail view shows a DataTable of all PayrollRunItems with breakdown columns
```

---

## Implementation Order

| Step | Task | Time |
|---|---|---|
| 1 | Migration `0034` — 3 new tables + `breakdown_json` + seed PayrollConfig | 30 min |
| 2 | Export new models from `app/models/payroll/__init__.py` | 5 min |
| 3 | `PayrollConfigService` + `get_monthly_tds()` + `get_attendance_days()` | 1 hr |
| 4 | `PayrollComputationService` — full-time + consultant compute functions | 3 hrs |
| 5 | `PayrollExportService` — 4 XLSX generators (openpyxl, data from breakdown_json) | 3 hrs |
| 6 | `PayrollAgent._process()` rewrite — compute + save + structured response | 2 hrs |
| 7 | `PayrollAgent._export()` — generate file + download URL response | 1 hr |
| 8 | `PayrollAgent._submit_for_approval()` — create ApprovalRequest | 45 min |
| 9 | API endpoints — `/payroll/export/{filename}` + config + TDS CRUD | 1.5 hrs |
| 10 | `PayrollRunCard.tsx` component (reusable) | 1.5 hrs |
| 11 | `PayrollExportDownload.tsx` component (reusable) | 30 min |
| 12 | `PayrollConfigPanel.tsx` + `CompanySettingsPanel.tsx` (Masters page) | 2 hrs |
| 13 | `EmployeeTDSModal.tsx` (employee profile) | 1.5 hrs |
| 14 | `AgentCommandPage.tsx` — add `payroll_summary` + `payroll_export` cases | 30 min |
| 15 | `PayrollPage.tsx` + wire to router + sidebar | 1 hr |
| 16 | End-to-end test all flows | 1 hr |
| **Total** | | **~20 hrs** |

---

## Verification Checklist

### DB / Migration
- [ ] `alembic upgrade head` reaches `20260729_0034` with no errors
- [ ] `payroll_configs` seeded with Maharashtra PT slabs, EPF rates
- [ ] `breakdown_json` column exists on `payroll_run_items`

### Computation — FULL_TIME
- [ ] BASIC = `gross_salary × 40%` (from SalaryStructure PERCENTAGE component)
- [ ] HRA = `BASIC × 60%`; CA = `BASIC × 50%`; EduA = `BASIC × 10%`
- [ ] MEDICAL = `gross - BASIC - HRA - CA - EduA - EmployerPF - EPF` (FORMULA component)
- [ ] EPF = `ROUND(min(BASIC, epf_wage_cap) × epf_employee_rate)` — values from PayrollConfig
- [ ] PT = correct slab (0 / 175 / 200) from PayrollConfig.professional_tax_slabs
- [ ] TDS pulled from `EmployeeTDSConfig` for correct financial year
- [ ] Pro-rating: 25/26 days → all earnings × (25/26), rounded correctly
- [ ] Employee with no salary assignment → skipped (not errored)
- [ ] Employee with no bank account → skipped (not errored)

### Computation — CONSULTANT
- [ ] `days_worked < 20` → `leave_deduction = fee × (20 - days) / 20`
- [ ] `days_worked > 20` → `extra_working = fee × (days - 20) / 20`
- [ ] TDS = `FLOOR(actual_pay × 10%)` — FLOOR, not ROUND
- [ ] `days_worked = 20` → no leave_deduction, no extra_working, TDS = FLOOR(fee × 10%)
- [ ] `days_worked = 18`, fee = 100000 → leave_deduction = 10000, actual_pay = 90000, TDS = 9000

### Approval Flow
- [ ] `PayrollRun.status` starts as DRAFT after generation
- [ ] Submit for approval → status = PENDING_APPROVAL + ApprovalRequest created in DB
- [ ] Finance approves → status = APPROVED
- [ ] Bank sheet button disabled for DRAFT and PENDING_APPROVAL
- [ ] Bank sheet button enabled after APPROVED

### XLSX Exports
- [ ] Employee sheet: company name from CompanySettings (not hardcoded)
- [ ] Bank sheet: debit account from CompanySettings.payroll_bank_account (not hardcoded)
- [ ] TDS sheet: PAN numbers populated for consultants from `employee.pan_number`
- [ ] All amounts match breakdown_json — no recomputation in export
- [ ] Download endpoint secured (auth required, filename regex validated)

### UI
- [ ] `PayrollRunCard` uses payroll (emerald) theme from `agent-theme.ts`
- [ ] Export buttons disabled with "Needs Approval" badge for bank sheet when not approved
- [ ] `PayrollExportDownload` shows filename + working download link
- [ ] `PayrollConfigPanel` editable, saves to DB, no hardcoded values in component
- [ ] `EmployeeTDSModal` accessible from employee profile tab
- [ ] Chat card (`payroll_summary`) renders correctly after "generate payroll for July"
- [ ] Chat card (`payroll_export`) renders download link after export command

---

## File Summary

```
NEW BACKEND:
  backend/app/services/payroll_computation.py
  backend/app/services/payroll_config_service.py
  backend/app/services/payroll_export.py
  backend/alembic/versions/20260729_0034_payroll_masters.py
  storage/payroll/                                   ← XLSX output directory

MODIFIED BACKEND:
  backend/app/models/payroll/models.py               (+PayrollConfig +CompanySettings +EmployeeTDSConfig +breakdown_json)
  backend/app/models/payroll/__init__.py             (+exports)
  backend/app/agents/payroll_agent/service.py        (rewrite _process, +_export, +_submit_for_approval)
  backend/app/api/v1/endpoints/payroll.py            (+export download, +config CRUD, +TDS CRUD)
  backend/app/api/v1/router.py                       (+new payroll routes)

NEW FRONTEND:
  frontend/src/components/payroll/PayrollRunCard.tsx
  frontend/src/components/payroll/PayrollExportDownload.tsx
  frontend/src/components/payroll/PayrollConfigPanel.tsx
  frontend/src/components/payroll/CompanySettingsPanel.tsx
  frontend/src/components/payroll/EmployeeTDSModal.tsx
  frontend/src/pages/PayrollPage.tsx

MODIFIED FRONTEND:
  frontend/src/pages/AgentCommandPage.tsx            (+payroll_summary +payroll_export cases)
  frontend/src/router.tsx                            (+/payroll route)
  frontend/src/components/ui-system/Sidebar.tsx      (+Payroll nav item)
  frontend/src/services/payroll.ts                   (+API calls for new endpoints)
```
