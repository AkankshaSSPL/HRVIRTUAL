# Standard Payroll Processing — Dynamic Pay-Type Masters + Rule Builder

**Status:** Proposed (awaiting review)
**Branch target:** `main`
**Scope:** Backend models/engine/API, Payroll Settings UI, agent-pluggable CRUD,
plus LOP audit view and consultant leave balances.

---

## 1. Why this change

Payroll works today, but the pay logic is **hardcoded to two worker types**. The engine
branches once:

```python
# backend/app/services/payroll_computation.py:251
if employee.employment_type == EmploymentType.CONSULTANT:
    breakdown = _compute_consultant(...)   # flat fee − leave deduction − 10% TDS
else:
    breakdown = _compute_fulltime(...)     # salary structure components − EPF/PT/TDS
```

Adding a new type (Intern, Contractor, Retainer…) with its own rules requires editing
Python. We want **pay types to be master data** — each with a fully custom, editable
rule set — so new types and rule changes happen from the UI (and via agent commands),
not code.

## 2. What already exists (reuse — do NOT rebuild)

| Capability | Where | Reuse as |
|---|---|---|
| Component engine: FIXED / PERCENTAGE / FORMULA | `payroll_computation.py::evaluate_component` | Rule evaluation for earnings/deductions |
| `SalaryComponent`, `SalaryStructure`, `SalaryStructureItem` | `models/payroll/models.py` | Precedent for the rule model; components remain the reusable library |
| Statutory config: EPF rate/cap, **PT slabs**, consultant TDS %, base working days | `PayrollConfig` + `GET/PUT /payroll/config` | Central knobs the statutory rules read |
| Per-employee TDS | `EmployeeTDSConfig` + endpoints | TDS source for structure types |
| Leave → LOP proration | `lop_calculator.calculate_lop()` → `prepare_employee_payroll_input()` | Proration + leave deduction inputs |
| Generic masters CRUD (departments, designations, **leave types**, lookups) | `api/v1/endpoints/masters.py` + `pages/MastersPage.tsx` | Pattern to mirror; leave-policy editing already done here |
| Salary structure assignment | `POST /payroll/salary-assignments`, `getEmployeeSalary()` | Manual assignment (needs a non-chat button) |
| Payroll masters REST pattern | `payroll.py` `/components` `/structures` `/config` | Shape for new `/pay-types` endpoints |

`Employee.employment_type` is already a free `String(40)` (not a DB enum). Total code
coupling to the `EmploymentType` enum is **3 references** — so the cutover is low-risk.

## 3. Design — Pay Type = master + custom rule set

A **Pay Type** becomes a first-class master that owns an ordered, fully custom **rule
set** (earnings + deductions + statutory) plus proration behaviour. The two existing
behaviours are re-expressed as **seed data**, not code:

- `FULL_TIME` → `STRUCTURE` basis; rules: Basic/HRA/Conveyance/Medical/Special
  (earnings) + EPF + Professional Tax + TDS (statutory deductions).
- `CONSULTANT` → `FLAT_FEE` basis; rules: monthly fee (earning) + leave deduction +
  flat TDS.

### 3.1 New models — `backend/app/models/payroll/models.py`

**`PayType`**
| Field | Type | Notes |
|---|---|---|
| `code` | str, unique | Matches `Employee.employment_type` (e.g. `FULL_TIME`, `INTERN`) |
| `name` | str | Display label |
| `pay_basis` | str | `STRUCTURE` \| `FLAT_FEE` |
| `proration_basis` | str | `CALENDAR_WORKING_DAYS` \| `FIXED_BASE_DAYS` |
| `base_working_days` | int | Used when `FIXED_BASE_DAYS` |
| `active` | bool | Soft toggle |
| `description` | str? | |

**`PayTypeRule`** (superset of `SalaryStructureItem` — adds deductions + proration flag)
| Field | Type | Notes |
|---|---|---|
| `pay_type_id` | FK | Cascade |
| `sequence` | int | Evaluation order |
| `code` / `label` | str | e.g. `BASIC`, `EPF`, `LEAVE_DEDUCTION` |
| `kind` | str | `EARNING` \| `DEDUCTION` \| `EMPLOYER_CONTRIBUTION` |
| `calc_type` | str | `FIXED` \| `PERCENT_OF` \| `FORMULA` \| `STATUTORY_EPF` \| `STATUTORY_PT` \| `STATUTORY_TDS` \| `FLAT_TDS` \| `LEAVE_DEDUCTION` |
| `value` | num? | For FIXED / PERCENT_OF / FLAT_TDS(rate) |
| `reference_code` | str? | Base component for PERCENT_OF |
| `formula` | str? | For FORMULA (existing safe-eval) |
| `taxable` | bool | |
| `prorate` | bool | Whether LOP proration applies to this rule |

Statutory calc types (`STATUTORY_EPF/PT/TDS`, `FLAT_TDS`, `LEAVE_DEDUCTION`) **read their
numbers from `PayrollConfig` / `EmployeeTDSConfig` / `calculate_lop()`** — so slabs and
rates stay centrally editable and are never duplicated in rules.

### 3.2 Migration

New Alembic revision (chains from current head): create `pay_types` + `pay_type_rules`
tables and **seed `FULL_TIME` + `CONSULTANT`** with rules that reproduce today's exact
output — this is the regression-safety net for the cutover.

### 3.3 Engine change — `backend/app/services/payroll_computation.py`

Replace the hardcoded branch with:

```
pay_type = pay_type_service.get_by_code(db, employee.employment_type)  # + default fallback
compute proration (working_days, lop_days) via prepare_employee_payroll_input()
for rule in pay_type.rules (by sequence):
    amount = evaluate_rule(rule, resolved, gross, config, employee, lop_input)
    apply proration if rule.prorate
    bucket into earnings / deductions / employer_contributions
net = sum(earnings) − sum(deductions)
```

- FIXED / PERCENT_OF / FORMULA reuse `evaluate_component()`.
- New small handlers for the statutory/flat/leave calc types (read `PayrollConfig`,
  `EmployeeTDSConfig`, `calculate_lop()`).
- **Output shape unchanged** — `PayrollRunItem` (`gross_salary`, `deductions`,
  `lop_days`, `net_salary`) + `breakdown_json` — so all exports and the bank sheet keep
  working untouched.
- A label-only `employment_type` with no `PayType` row falls back to a default
  `STRUCTURE` pay type (no silent breakage / no crash).

### 3.4 Service layer (single source of truth) — `backend/app/services/pay_type_service.py` (NEW)

`list_pay_types`, `get_by_code`, `create_pay_type`, `update_pay_type`,
`delete_pay_type`, `set_rules`. **Both** the REST endpoints and the agent handlers call
these — this is what makes the feature agent-pluggable without duplicate logic.

## 4. Manual flow (DB → API → UI)

### 4.1 API — `backend/app/api/v1/endpoints/payroll.py`

Mirror the existing masters pattern:
- `GET /payroll/pay-types`, `POST /payroll/pay-types`,
  `PUT /payroll/pay-types/{id}`, `DELETE /payroll/pay-types/{id}` (with nested rules) —
  guarded by `payroll:manage` / `payroll:view`.
- Reuse existing `/payroll/config` and `/payroll/salary-assignments`.
- Add `GET /payroll/runs/{id}/lop-audit` (see §6).

### 4.2 UI — new **Settings tab** on `frontend/src/pages/PayrollPage.tsx`

Add a **Settings** tab beside Runs / Components / Structures containing:
1. **Pay Types** — list + `DrawerPanel` editor; each type edits its rule set
   (add / reorder / remove earning/deduction/statutory rules). Reuse the `SectionCard` +
   component-form pattern already on this page.
2. **Statutory Config** — form over `GET/PUT /payroll/config`: EPF rate/cap, **PT slab**
   table editor, consultant/flat TDS %, base working days.
3. **Assign salary structure to employee** — manual button/drawer calling the existing
   `createSalaryAssignment` (and **de-dupe** the duplicated copies in `payroll.ts` +
   `salaryAssignments.ts`).

Service additions in `frontend/src/services/payroll.ts`: `getPayTypes`, `createPayType`,
`updatePayType`, `deletePayType`, `setPayTypeRules`, plus config get/set and
`getPayrollLopAudit`.

Employee create/edit (`EmployeeCreateWizard`, `EmployeeEditDrawer`) read active Pay
Types for the employment-type dropdown (already lookup-driven).

## 5. Agent-pluggable

Extend the payroll / salary-structure agents so natural-language commands
("create a pay type Intern, flat fee, no EPF, 5% TDS", "add HRA 40% of basic to Full
Time") route to the **same** `pay_type_service` / component services. Register handlers
in the existing agent handler registry (mirror `salary_structure_agent` /
`payroll_agent`). No parallel implementation — agent and UI share the service layer.

## 6. Also in this build (leave visibility)

- **Pre-approval LOP audit** — `GET /payroll/runs/{id}/lop-audit` reads existing
  `PayrollRunItem.breakdown_json` (`days_worked`, `working_days`, `lop_days`) + a
  per-employee approved-leave list (via `calculate_lop`). Surfaced as a "Review leaves &
  LOP" drawer on `PayrollRunCard.tsx` for DRAFT / PENDING_APPROVAL runs — so HR can
  verify leave impact **before** approving and generating the bank sheet.
- **Consultant leave balances** — seeding is already type-agnostic
  (`ensure_default_balances`); include consultants in the leave workspace list so their
  balances appear.

## 7. Files (representative)

```
BACKEND
  app/models/payroll/models.py                 +PayType, +PayTypeRule
  alembic/versions/<new>_pay_types.py          tables + seed FULL_TIME/CONSULTANT
  app/services/pay_type_service.py             NEW — CRUD + rule resolution
  app/services/payroll_computation.py          strategy-driven engine; drop hardcoded branch
  app/api/v1/endpoints/payroll.py              +pay-types CRUD, +lop-audit
  app/agents/payroll_agent|salary_structure_agent/handlers.py   agent commands → services
FRONTEND
  src/services/payroll.ts                      +pay-type/config/lop-audit fns; de-dupe
  src/pages/PayrollPage.tsx                     +Settings tab (pay types, config, assignment)
  src/components/payroll/PayrollRunCard.tsx     +Review LOP button
```

No change to the DB shape of `PayrollRun` / `PayrollRunItem`, exports, or the bank sheet.

## 8. Verification

1. **Regression:** run payroll for a month before and after the migration — FULL_TIME +
   CONSULTANT seeded rules must produce the **same** net figures as the old hardcoded
   logic.
2. **New type:** create Pay Type "Intern" (flat fee, no EPF/PT, 5% TDS) in Settings →
   assign to a test employee → generate run → net follows the new rules; bank sheet and
   exports include them.
3. **Dynamic config:** edit PT slabs / EPF rate in Statutory Config → regenerate →
   deductions change accordingly.
4. **LOP audit:** the drawer's deduction per employee matches the bank-sheet net; a
   consultant appears in leave balances.
5. **Agent parity:** the same create-pay-type / add-component operations work via agent
   command.

## 9. Rollout / safety

- Additive migration (new tables only); existing tables untouched → easy rollback.
- Seed data reproduces current behaviour, so the cutover is invisible until someone adds
  or edits a type.
- Fallback pay type guarantees any legacy `employment_type` value still computes.
