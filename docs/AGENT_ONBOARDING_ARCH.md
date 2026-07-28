# Agent Command Onboarding — Architecture & Debug Guide

This doc explains exactly how the onboarding flow works through the Agent Command chat, which files own each piece, and how to diagnose breakage. Written after fixing the multi-turn routing bug on 2026-07-28.

---

## The full message lifecycle (one user turn)

```
User types message in AgentCommandPage.tsx
        ↓
POST /api/v1/agent-command/send  { user_message: "onboard Priya..." }
        ↓
coordinator_agent/service.py → submit_command()
    1. natural_language_extractor.extract(command)
       → intent: "onboarding", confidence: 0.95, missing_fields: []
    2. _analyze_intent(command, user_id)
       → checks _has_active_onboarding_finishing() for continuation turns
       → returns matched_intent: "onboarding" or "onboarding finishing conversation"
    3. missing_fields gate (line ~208)
       → SKIPPED if is_onboarding_continuation == True  ← the fix
    4. _route_from_extraction() → agent_name: "onboarding_agent"
    5. _invoke_domain_agent() → OnboardingAgent.execute()
        ↓
onboarding_agent/service.py → execute()
    1. _is_new_onboarding_command() — is this "onboard X" (new) or a reply (continuation)?
    2. If continuation: load the existing employee via _latest_onboarding_finishing_employee_id()
    3. _extract_fields()
       → llm_available()? → llm_extract_onboarding() via gpt-4o-mini
       → else: extract_onboarding_entities() regex fallback
    4. If no employee yet: _create_early() — writes Employee row immediately
    5. Else: _apply_fields() — updates existing employee row with new info
    6. compute_onboarding_progress() → percent, 7 items
    7. _next_section() → which step to ask about next
    8. _reply() → LLM composes natural reply, or template fallback
    9. Returns structured_response { type: "onboarding_finishing", progress, employee_id, ... }
        ↓
coordinator wraps result → AgentRun saved with metadata_json.result.structured_response
        ↓
Frontend polls / receives response
AgentCommandPage.tsx → renderStructuredResponse()
    → type == "onboarding_finishing" → <OnboardingFinishingCard>
        → <OnboardingStatusPanel> (7-step bar)
        → contextual action for current pending step:
            documents  → "Attach" button  → handleAttach() → uploadEmployeeDocument()
            seating    → "Open seat map"  → <SeatingAllocationModal>
            welcome_mail → "Send Welcome Mail" → commandMutation("yes")
```

---

## File map

| What | File |
|---|---|
| Coordinator routing + missing_fields gate | `backend/app/agents/coordinator_agent/service.py` |
| NL intent extraction (rules + optional OpenAI) | `backend/app/agents/shared/natural_language.py` |
| Onboarding entity extraction (regex fallback) | `backend/app/agents/shared/extraction.py` |
| Onboarding conversation loop | `backend/app/agents/onboarding_agent/service.py` |
| LLM field extraction + reply composition | `backend/app/agents/onboarding_agent/llm.py` |
| Employee create / update / type parsing | `backend/app/agents/employee_agent/tools.py` |
| 7-step progress computation | `backend/app/services/onboarding_progress.py` |
| Seat assignment service | `backend/app/services/seat_service.py` |
| Onboarding finishing card (chat UI) | `frontend/src/pages/AgentCommandPage.tsx` → `OnboardingFinishingCard` |
| 7-step progress bar (shared) | `frontend/src/components/employees/OnboardingStatusPanel.tsx` |
| Seat grid modal | `frontend/src/components/employees/SeatingAllocationModal.tsx` |
| Employee + Seat + Asset models | `backend/app/models/employee/models.py` |

---

## The 7 onboarding steps

Defined in `backend/app/services/onboarding_progress.py`:

| # | Key | Complete when |
|---|---|---|
| 1 | `personal_details` | `first_name`, `last_name`, `personal_email` all set |
| 2 | `employment_details` | `department_id`, `designation_id`, `reporting_manager_id` all set |
| 3 | `payroll_readiness` | `bank_account_number`, `ifsc_code`, `pan_number` all set |
| 4 | `salary` | `current_salary` is set |
| 5 | `documents` | at least 1 `EmployeeDocument` row with status `VERIFIED` |
| 6 | `seating` | `employee.seat_label` is not null |
| 7 | `welcome_mail` | `employee.welcome_kit_sent_at` is not null |

Steps 1–4 are collected conversationally. Steps 5–7 are the "finishing" phase — the `FINISHING_STEP_ORDER = ["documents", "seating", "welcome_mail"]` list in `onboarding_agent/service.py`.

---

## Multi-turn routing: how continuation messages find their way back

This is the trickiest part. When a user types a bare reply like `"priya@company.com"` or `"A-3"`, the NL extractor doesn't classify it as onboarding — it has no intent. The flow depends on:

1. **`_has_active_onboarding_finishing(db, user_id)`** in `coordinator_agent/service.py`  
   Scans the last 8 `AgentRun` rows for the current user. If any has `metadata_json.result.structured_response.type == "onboarding_finishing"` and `completed == false`, returns that employee's id.

2. **`_analyze_intent()`** calls this check at line ~530 and returns `matched_intent = "onboarding finishing conversation"` if True.

3. **The gate at line ~208** skips `missing_fields` blocking when `is_onboarding_continuation == True`.

4. **`_is_new_onboarding_command(command)`** in `onboarding_agent/service.py`  
   Pattern: `\b(?:onboard|hire|start onboarding for)\s+[A-Za-z]`  
   If True → always starts fresh, ignores existing finishing-phase employee.  
   If False → loads the existing employee from `_latest_onboarding_finishing_employee_id()`.

**Implication:** If the user types "onboard Priya" while another onboarding is mid-finishing-phase, a second employee is created. The first one stays in limbo until someone finishes it from the profile page. This is intentional.

---

## LLM extraction

`backend/app/agents/onboarding_agent/llm.py`

**`llm_available()`** — returns True only if `OPENAI_API_KEY` is set and not a placeholder string. Check `_PLACEHOLDER_KEYS` at the top of the file.

**`llm_extract_onboarding(message, known_fields)`** — sends the user message plus already-known fields to gpt-4o-mini with `with_structured_output(OnboardingFields)`. Returns a Pydantic model with all 17 onboarding fields. On any failure, raises — caller falls back to regex.

**`llm_compose_reply(...)`** — given name, percent, section label, fields to ask, just-captured fields, generates a warm one-sentence reply. Temperature 0.4.

**`OnboardingFields` schema** (defined in `llm.py`): `first_name, last_name, personal_email, phone, dob, gender, designation, department, manager, joining_date, employment_type, salary, bank_account_number, ifsc_code, pan_number, aadhaar_number, uan_number, seat`

**Regex fallback** — `backend/app/agents/shared/extraction.py`. Works for structured inputs ("bank account 1234...", "PAN ABCDE1234F") but will miss casual phrasing. The fallback is good enough for most inputs.

---

## Employment type handling

`EmploymentType` enum (in `models.py`) only has `FULL_TIME` and `CONSULTANT`.

The safe parse is in `backend/app/agents/employee_agent/tools.py → _parse_employment_type()`:
```python
_EMPLOYMENT_TYPE_MAP = {
    "PART_TIME": EmploymentType.FULL_TIME,
    "CONTRACT": EmploymentType.CONSULTANT,
    "FREELANCE": EmploymentType.CONSULTANT,
    "INTERN": EmploymentType.FULL_TIME,
    "INTERNSHIP": EmploymentType.FULL_TIME,
    "TEMPORARY": EmploymentType.FULL_TIME,
}
```
If the LLM returns something not in the enum and not in the map, it defaults to `FULL_TIME`. No crash.

---

## Common breakage and how to diagnose

### "I could not complete this request" on turn 1

Check the `execution_summary` field in the workflow response — it contains the raw Python exception. Common causes:

| Error | Cause | Fix |
|---|---|---|
| `column "asset_name" does not exist` | Migration 0029 not applied | `alembic upgrade head` |
| `column "validity_date" does not exist` | Same migration | same |
| `ValueError: 'CONTRACT' is not a valid EmploymentType` | Old code before the fix | pull `bc6db03` |
| `relation "seats" does not exist` | Migration 0027 not applied | `alembic upgrade head` |

### Continuation message returns a clarification banner ("Please provide the employee name")

The `is_onboarding_continuation` guard isn't firing. Check:
1. Is the previous turn's `structured_response.type` actually `"onboarding_finishing"`? Look at the `metadata_json` of the last `AgentRun` in the DB.
2. Is `completed` set to `false` in that response? If `completed: true`, the finishing phase is done and there's nothing to continue.
3. Is the user the same? `_has_active_onboarding_finishing` filters by `requested_by`.

SQL to debug:
```sql
SELECT metadata_json->'result'->'structured_response'->>'type' as stype,
       metadata_json->'result'->'structured_response'->>'completed' as completed,
       created_at
FROM agent_runs
WHERE agent_name = 'coordinator_agent'
  AND requested_by = '<user-uuid>'
ORDER BY created_at DESC
LIMIT 8;
```

### Onboarding starts fresh instead of resuming

`_is_new_onboarding_command()` matched — the user's message contained `onboard|hire` followed by a letter/name. Intentional. If you need to resume without starting over, type something that doesn't match that pattern (e.g. just provide the missing info directly).

### Progress stuck at same % across multiple turns

`_apply_fields()` probably found nothing to update — the LLM didn't extract any new fields from the message. Check what `llm_extract_onboarding()` returned by looking at the backend logs (logged at INFO level: `"Onboarding turn (source=%s) captured=%s"`).

### Seat modal doesn't update occupancy after assignment

`SeatingAllocationModal` calls `POST /employees/{id}/seat` → `seat_service.assign_seat()` → updates both `employee.seat_label` and `seats.status + seats.employee_id` atomically. If the grid still shows AVAILABLE after assignment, the modal may not have invalidated the `getSeats` query. Check `onAssigned` callback in `AgentCommandPage.tsx` — it sends `"continue onboarding"` which triggers a re-fetch of the workflow.

---

## Useful debug SQL

```sql
-- Current onboarding progress per employee
SELECT first_name, last_name, seat_label,
       bank_account_number IS NOT NULL as has_bank,
       pan_number IS NOT NULL as has_pan,
       current_salary IS NOT NULL as has_salary,
       welcome_kit_sent_at IS NOT NULL as welcome_sent
FROM employees
WHERE deleted_at IS NULL
ORDER BY created_at DESC;

-- Last 5 onboarding agent runs for a user
SELECT id, status, created_at,
       metadata_json->'result'->>'execution_status' as exec_status,
       metadata_json->'result'->'structured_response'->>'type' as stype,
       metadata_json->'result'->'structured_response'->>'completed' as done,
       metadata_json->'result'->>'execution_summary' as err
FROM agent_runs
WHERE agent_name = 'coordinator_agent'
  AND metadata_json->'result'->'structured_response'->>'type' = 'onboarding_finishing'
ORDER BY created_at DESC
LIMIT 5;

-- Seats occupancy
SELECT zone, status, label, employee_id FROM seats ORDER BY zone, label;

-- Assets for an employee
SELECT asset_type, asset_code, asset_status, assigned_at FROM employee_assets
WHERE employee_id = '<uuid>' ORDER BY assigned_at;
```
