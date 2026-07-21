# Onboarding Implementation Plan — manual + multi-turn agent, 7-step status

Every "current state" claim is verified against this codebase and cited to `file:line`.

**Repo:** `AkankshaSSPL/HRVIRTUAL` · **DB:** `hrms` at alembic `20260720_0025` · Backend `:8000`,
frontend `:5173` · Login `admin@example.com` / `ChangeMe123!`
**Reference UI:** `reference_images/` (match the layout; **use our data fields only** — do not add the
reference's branch/shift/attendance-policy/biometric/password/image/address/bank-name/tax-id fields).

## Context & locked decisions

One HR superadmin onboards a person **manually (control panel) AND via a multi-turn chat agent that
mirrors the manual flow exactly**. A **7-step status bar** tracks onboarding; at **100%** the person
leaves the **Onboarding** page and appears in the **Employees** page.

- **Single Employees list** (reference Image #7) — "Manager" is a designation. **No `staff_type`.**
  The only new column is `seat_label`.
- Auth only, no authorization (the single superadmin bypasses `require_permissions`; no auth changes).
- **Salary is a plain field** (`Employee.current_salary`) — no salary_assignment, no approval.
- **Real welcome email** via stdlib `smtplib` (SMTP creds pending). Reuse the `welcome_kit_sent_at`
  column + `/send-welcome-kit` endpoint (relabelled "Welcome mail").
- **Seating** = a mock **seat matrix** popup, kept as the last step.
- **Graduation** at 100%: `< 100%` → Onboarding page (with progress bars), `== 100%` → Employees page.
- **Agent does read AND create.** Create reuses the existing multi-turn machine; docs uploaded via the
  chat Attach. Every agent step calls the same function the manual endpoint calls.

## The 7-step status bar (the spine)

`app/services/onboarding_progress.py::compute_onboarding_progress` (56-90) currently tracks Personal,
Employment, Payroll, Documents, Salary(assignment), Approval, Welcome. **Retarget to:**

| # | key | Complete when | Filled by |
|---|-----|---------------|-----------|
| 1 | personal_details | first_name & last_name & personal_email | create |
| 2 | employment_details | department_id & designation_id & reporting_manager_id | create/update |
| 3 | payroll_readiness | bank_account_number & ifsc_code & pan_number | create/update |
| 4 | salary | current_salary set | create/update |
| 5 | documents | ≥1 EmployeeDocument status == VERIFIED | doc upload |
| 6 | seating | seat_label set | seat popup / agent |
| 7 | welcome_mail | welcome_kit_sent_at set | send-welcome-kit |

## Already present in this baseline (no rebuild)

4 required create fields (`employees.py:34,35,37,44`); `EmployeeProfilePage` + `OnboardingProgressPanel`
(13-91); `onboarding_progress` service; `/onboarding-progress` (122-127), `/send-welcome-kit`
(130-157), `/deactivate` (212-234); `create_employee_draft` reads `current_salary`/`salary`
(tools.py:283) and `emergency_contact`; **`POST /documents` is already a multipart file upload that
auto-marks the document `VERIFIED`** (documents.py:50-102); the **multi-turn onboarding agent already
exists** (below), just disabled.

---

## Backend (manual)

**B1 — Migration (seat_label only).** `app/models/employee/models.py` (Employee 130-174): add
`seat_label = mapped_column(String(120))` after line 162. New
`alembic/versions/20260722_0026_add_employee_seat_label.py`, `revision="20260722_0026"`,
`down_revision="20260720_0025"`; then `alembic upgrade head`.

**B2 — Create/update schema + auto code.** `app/api/v1/endpoints/employees.py`:
`EmployeeCreateRequest` (33-52) add `current_salary: Decimal | None = None` (+ optional
`emergency_contact`); `create_employee` (160-182) auto-generate `EMP`+zero-padded code when blank;
`EmployeeUpdateRequest` (55-74) add `current_salary`, `seat_label`.

**B3 — Persist.** `app/agents/employee_agent/tools.py`: `create_employee_draft` (248-296) add
`seat_label`; `update_employee_fields` allowed set (216-237) add `"seat_label"`; `employee_to_summary`
(47-61) + `employee_profile` (64-84) add `seat_label`.

**B4 — Progress rewrite.** `app/services/onboarding_progress.py` (56-90): remove payroll/
salary-assignment imports (11-16), `_latest_salary_assignment`/`_is_approved`, and the
`salary`(assignment)+`approval` items (71-79). New 7 items above:
`salary_complete = employee.current_salary is not None`, `seating_complete = bool(employee.seat_label)`;
keep `percent`, `completed`, `pending`, `welcome_kit_ready = all(complete for items where key !=
"welcome_mail")`.

**B5 — Seat endpoint.** `employees.py`: `POST /{employee_id}/seat` (gate `employees:manage`), body
`{seat_label}` → `update_employee_fields` → commit → return `compute_onboarding_progress`. Mirror
`send_welcome_kit` (130-157).

**B6 — Real welcome email (SMTP creds pending).** `app/core/config.py` (1-44): add
`smtp_host/smtp_port(587)/smtp_user/smtp_password/smtp_from/email_enabled(False)` (validation_alias);
mirror to `.env.example`. New `app/services/email_service.py::send_welcome_email(employee)` (stdlib
`smtplib` + `EmailMessage`, no new dependency; `email_enabled=False` → log). Upgrade `send_welcome_kit`
(130-157): keep the `welcome_kit_ready` guard, send, and only-on-success stamp + audit + commit.

**B7 — List carries onboarding_percent.** `employees.py` list route (77-99): attach
`onboarding_percent` per row from `compute_onboarding_progress(...)["percent"]`. Keep `_without_salary`.

---

## Frontend (manual)

**F1 — Create form → reference sections, our fields only.**
`src/components/employees/EmployeeCreateWizard.tsx` (steps 34-38; validation 48-73; `createEmployee`
@123): restyle to the reference's sections — Basic / Employment / Emergency Contact
(→ `emergency_contact` JSONB) / Banking (incl. **Salary → current_salary**). Auto employee_code shown
read-only. Omit unsupported reference fields. Keep the 4 required; add `current_salary` to the payload.

**F2 — Service + types.** `src/services/employees.ts`: `EmployeeCreatePayload` (37-57) add
`current_salary?` (+ optional `emergency_contact`); `EmployeeRecord` (3-29) add `seat_label`,
`onboarding_percent`; add `setEmployeeSeat(id, seat_label)` → `POST /employees/{id}/seat`; add
`uploadEmployeeDocument(employeeId, documentType, file)` → multipart `POST /documents` (FormData/XHR
template: `uploadOnboardingResume` in `services/agents.ts:109-137`).

**F3 — Status bar specials.** `EmployeeProfilePage.tsx OnboardingProgressPanel` (13-91): `seating`
step → open the seat-matrix popup (F4); `welcome_mail` → the Send-mail button (82-88); others → tab
switch. Relabel the button "Send Welcome Mail".

**F4 — Seating matrix popup (last step).** New `src/components/employees/SeatingAllocationModal.tsx`
(reuse `DrawerPanel`/`ConfirmDialog`): a seat **matrix** grid (rows A–E × 1–8), some seats statically
occupied, the rest selectable, highlight the current `seat_label`; selecting → `setEmployeeSeat` →
invalidate `["employee-onboarding-progress", id]`.

**F5 — Salary on profile.** Drive step 4 off `current_salary`; show/edit it in the profile Payroll
section + `EmployeeEditDrawer`. Leave the old approval-governed Salary tab untouched.

**F6 — Onboarding page (<100%) + Employees (==100%).** `src/pages/OnboardingPage.tsx` (currently
`getWorkflows`, 21-65): repurpose to `getEmployees` filtered `onboarding_percent < 100`, each card
with a progress bar + % like the profile status bar (extract the bar from `OnboardingProgressPanel`);
row → `/employees/:id`. `src/pages/EmployeesPage.tsx` (13-42, actions 104-110): filter
`onboarding_percent === 100` — single list like Image #7.

**F7 — Status bar in the control panel.** Add an "Onboarding Progress" section to the Dashboard listing
in-progress employees (`onboarding_percent < 100`), each with the same progress bar + % (reuse F6's bar).

---

## Phase B — Agent (read + multi-turn create), sub-phased by value

### B-agent-1 — Fix the read lookup bug (small, high value)

The agent currently returns "Employee not found" for employees that exist (e.g. "show profile of Gouri
Chillure"). Fix the name-match in `employee_agent/tools.py` (`find_one_employee`/`search_employees`) so
existing employees resolve. Add an onboarding-progress read: route a progress question to
`compute_onboarding_progress(employee)` and render a lean card (`AgentCommandPage.tsx` dispatch from 292).

### B-agent-2 — Re-enable + extend create (persist ALL our fields)

The multi-turn machine already exists and is intact — it detects an in-progress draft across turns
(`onboarding_agent/service.py::_latest_onboarding_draft` 474-491, via the last 8 `AgentRun` rows),
merges new info, asks for missing fields (`_missing_field_response` 494-520), summarizes, and creates
on confirmation (`execute` 45-82). It is only **disabled** and **drops** salary/bank/PAN at creation.

- **Re-enable routing:** uncomment the `_route_from_extraction` mapping
  (`coordinator_agent/service.py:481-485`) → `("onboarding_agent","start","onboarding","start")`.
  Intent already lands at `natural_language.py:280-281` (0.95); the agent stays registered (17/21/86)
  and dispatched (712-714).
- **Collect our fields:** extend `shared/extraction.py::extract_onboarding_entities` (11-31) to capture
  `bank_account_number`, `ifsc_code`, `pan_number`, `aadhaar_number`, `uan_number`, `dob`, `gender`,
  `seat`; add `email` to `ONBOARDING_REQUIRED_FIELDS` (extraction.py:8, currently
  `["name","joining_date","manager"]`).
- **Persist them:** extend the `_create_employee_from_onboarding` payload
  (`onboarding_agent/service.py:227-243`) to pass `current_salary` (from `salary`),
  `bank_account_number`, `ifsc_code`, `pan_number`, `aadhaar_number`, `uan_number`, `dob`, `gender`,
  `personal_email` into `create_employee_draft`. **Remove** the salary-approval path
  (`_request_salary_approval_if_needed`) — salary is just a field now.

### B-agent-3 — Chat-drive documents + seat + welcome to 100% (the new part)

After creation the agent enters a **finishing loop** driven by `compute_onboarding_progress` of the new
employee (store `onboarding_employee_id` in the response so the next turn continues — same pattern as
the draft). Each turn it prompts for the next incomplete step:

- **Documents (step 5):** the agent returns `awaiting_upload: {employee_id, document_type}`. Frontend:
  when `awaiting_upload` is present, route the chat **Attach** to `uploadEmployeeDocument(...)` →
  multipart `POST /documents` (auto-VERIFIED, documents.py:50-102) instead of the resume endpoint.
  Extend `CommandInput`/`AgentCommandPage` `onAttach` to branch on the pending `awaiting_upload`, and
  widen accepted file types (image/pdf) for identity docs.
- **Seating (step 6):** the agent prompts "reply with a seat like A-3"; on reply →
  `update_employee_fields(seat_label)`. (Manual users use the F4 matrix popup.)
- **Welcome mail (step 7):** the agent prompts "send the welcome mail? (yes)"; on yes →
  `send_welcome_email` + stamp `welcome_kit_sent_at`.
- At `percent == 100` → "Onboarding complete — <name> is now in Employees."

**Delivery note:** B-agent-1 is small/high-value; B-agent-2 is medium; B-agent-3 is the largest
(frontend Attach-routing + backend finishing loop). If time is tight, ship 1 + 2 (agent creates a
mostly-complete record; the human finishes docs/seat/mail on the profile) and add 3 after.

---

## Sequencing

1. **Data spine:** B1, B2, B3, B4, F2 → restart backend, verify 7-step progress.
2. **Views:** B5, B7; F6 (Onboarding < 100% + Employees == 100%); F7 dashboard.
3. **Form + seating:** F1 restyle; F3/F4 seat-matrix popup; F5 salary.
4. **Email:** B6 (needs SMTP creds).
5. **Agent:** B-agent-1, B-agent-2, B-agent-3.

## Verification (app already running; no test harness in repo)

After backend edits: `alembic upgrade head` (→ `20260722_0026`), restart uvicorn `:8000`; frontend
hot-reloads `:5173`.

1. Manual create incl. salary → auto employee_code → shows in **Onboarding** at partial %.
2. Fill employment + bank/IFSC/PAN, upload + verify a doc, assign a seat via the **matrix popup** → %
   climbs each step.
3. Send Welcome Mail → real email → **100%** → leaves Onboarding, shows in **Employees**.
4. Dashboard shows in-progress people with progress bars.
5. Agent read: "show profile of <existing employee>" → **found**; "what's <name>'s onboarding progress"
   → 7-step progress.
6. Agent create (multi-turn): "onboard <name>, joining today, manager <X>, email …, salary …, bank …/
   ifsc …/pan …" → agent asks for any missing required, creates → then prompts to Attach the document
   (→ VERIFIED), a seat, and the welcome mail → **100%** → appears in Employees.

## Open item

SMTP creds (host / port / user / password / from) — for B6 + verification steps 3 and 6.
