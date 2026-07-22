# Testing Flow & Context — HRVIRTUAL HRMS

Everything a developer needs to run, test, and debug this system.
**When something breaks, go straight to the relevant section.**

---

## 1. System overview

Single-superadmin HRMS. One HR user onboards employees/managers via a **manual form**
(3-step wizard) or a **conversational LLM agent** in Agent Command. Both paths write
to the same DB through the same underlying functions. A **7-step progress bar** tracks
onboarding; at 100% the person leaves the Onboarding page and appears in Employees.

```
React (Vite 6) :5173
      |
FastAPI :8000
      |
  SQLAlchemy 2.0
      |
PostgreSQL 16 (DB: hrms)
      |
OpenAI gpt-4o-mini  (onboarding agent LLM extraction + reply composition)
Gmail SMTP          (welcome email)
```

---

## 2. How to run

### Prerequisites
- Python 3.12 (`py -3.12`), Node 22, PostgreSQL 16 running locally

### Backend
```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Create the DB if it doesn't exist:
# psql -U postgres -c "CREATE DATABASE hrms;"
alembic upgrade head          # current head: 20260722_0026
python -m scripts.seed_auth   # creates admin@example.com / ChangeMe123!
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Frontend
```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1   # :5173
```

### Login
- URL: http://127.0.0.1:5173
- Email: `admin@example.com` / Password: `ChangeMe123!` (set in `backend/.env`)

---

## 3. Key environment variables (`backend/.env`)

| Variable | What it does | Default / note |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection | `postgresql+psycopg://postgres:password@localhost:5432/hrms` |
| `JWT_SECRET_KEY` | signs access + refresh tokens | change in prod |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seeded superadmin | set before first `seed_auth` |
| `OPENAI_API_KEY` | powers onboarding NLP (gpt-4o-mini) | **blank = rule-based fallback** |
| `OPENAI_INTENT_ENABLED` | global LLM intent routing | `false` (onboarding uses key directly) |
| `OPENAI_INTENT_MODEL` | model name | `gpt-4o-mini` |
| `EMAIL_ENABLED` | `true` = real SMTP; `false` = log only (step still completes) | `true` |
| `SMTP_HOST/PORT/USER/PASSWORD/FROM` | Gmail or other SMTP | configured for sipamara401@gmail.com |

---

## 4. Database migrations

**Chain:** `0001 → ... → 0025 (welcome_kit_sent_at) → 0026 (seat_label)` — single linear head.

```powershell
# Apply all pending:
cd backend && alembic upgrade head

# Check which revision the DB is at:
psql -U postgres -d hrms -c "SELECT version_num FROM alembic_version;"

# Roll back one:
alembic downgrade -1
```

New columns (added after initial setup):
- `employees.welcome_kit_sent_at` — DateTime, nullable — migration `20260720_0025`
- `employees.seat_label` — String(120), nullable — migration `20260722_0026`

---

## 5. Testing flows (manual, no test harness)

### 5.1 Manual employee onboarding (happy path)
1. **Employees page** → `+ Employee` button.
2. Fill **Step 1 (Basic):** First name, Last name *(required)*, Personal email *(required, must be valid format)*, joining date *(required, defaults today)*.
3. Fill **Step 2 (Employment):** Department, Designation, Reporting Manager, Status.
4. Fill **Step 3 (Payroll):** Bank account, IFSC, PAN, Salary.
5. Submit → employee created with auto-generated Employee Code (e.g. `EMP001`).
6. **Expected:** employee appears in **Onboarding** page at ~57% (personal + payroll + salary steps complete); `< 100%` keeps them there.
7. Open the employee profile → Documents tab → upload and verify a doc → Documents step flips green.
8. Profile status bar → click Seating step → **seat matrix popup** → pick a desk → Seating complete.
9. Profile status bar → click 7th step or the **Send Welcome Mail** button → email sent to personal_email → `welcome_kit_sent_at` stamped → **100%** → employee moves from Onboarding to **Employees** page.

### 5.2 Agent Command onboarding (LLM conversational path)
1. Go to **Agent Command** (`/agent-command`).
2. Type: `onboard <Name>` (minimum) or a full one-liner:
   ```
   onboard Ravi Sharma as backend developer in Engineering, manager Akanksha Kulkarni,
   email ravi@x.com, salary 60000, bank 5556667778, ifsc HDFC0009999, pan RSHARMS9999Z
   ```
3. **Expected turn 1:** employee created immediately, 7-step bar shown in chat at ≥14%, agent replies naturally asking for the next missing section.
4. Reply conversationally turn by turn (or paste more fields at once). Each turn the bar climbs.
5. When the bar reaches Documents: **Attach** button uploads the file → `POST /documents` → auto-VERIFIED → Documents step complete.
6. When bar reaches Seating: **Open seat map** button → seat matrix popup → pick desk → Seating complete, agent auto-continues.
7. When bar reaches Welcome mail: **Send Welcome Mail** button → real email + stamp → **100%** → agent confirms, employee appears in Employees.

### 5.3 Agent read queries (non-onboarding)
```
show profile of Gouri Chillure
what's Gouri's onboarding progress
show employees
```
- Profile lookup: resolved via name search (handles "show profile of employee <Name>", "find <Name>", plain "Name").
- Progress query: returns `onboarding_progress_check` card with the 7-step breakdown.

### 5.4 Graduation check (Onboarding → Employees)
After any onboarding route reaches 100%:
```sql
-- Should be 100 for the finished employee:
SELECT first_name, last_name, welcome_kit_sent_at, seat_label,
       bank_account_number, ifsc_code, pan_number
FROM employees WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5;
```
- Onboarding page: filters `onboarding_percent < 100` (auto-refreshes every 15s).
- Employees page: filters `onboarding_percent === 100`.
- Both read from `GET /employees` which computes `onboarding_percent` per row from `compute_onboarding_progress`.

---

## 6. The 7-step onboarding progress — how it's computed

**File:** `backend/app/services/onboarding_progress.py` → `compute_onboarding_progress(db, employee)`

| # | key | Condition |
|---|-----|-----------|
| 1 | `personal_details` | `first_name` AND `last_name` AND `personal_email` |
| 2 | `employment_details` | `department_id` AND `designation_id` AND `reporting_manager_id` |
| 3 | `payroll_readiness` | `bank_account_number` AND `ifsc_code` AND `pan_number` |
| 4 | `salary` | `current_salary IS NOT NULL` |
| 5 | `documents` | ≥1 `EmployeeDocument` with `status = VERIFIED` |
| 6 | `seating` | `seat_label IS NOT NULL` |
| 7 | `welcome_mail` | `welcome_kit_sent_at IS NOT NULL` |

`percent = round(completed / 7 * 100)`. `welcome_kit_ready = all 6 non-email steps complete`.

**To debug a wrong %:** `GET /api/v1/employees/{id}/onboarding-progress` — returns the full items list with each step's `complete` flag.

---

## 7. LLM onboarding agent — architecture and debug

### Files
| File | Purpose |
|---|---|
| `backend/app/agents/onboarding_agent/llm.py` | LLM layer: `llm_extract_onboarding` + `llm_compose_reply` |
| `backend/app/agents/onboarding_agent/service.py` | `OnboardingAgent.execute` — the conversational loop |
| `backend/app/agents/shared/extraction.py` | Regex fallback extraction (also used for seat/confirmation parsing) |
| `backend/app/agents/coordinator_agent/service.py` | Routes "onboard"/"hire" → `onboarding_agent`; finishing continuation |

### How a turn works
```
user message
    ↓
llm_extract_onboarding(message, known_fields)   ← gpt-4o-mini structured output
    ↓  (fallback: extract_onboarding_entities regex)
validated OnboardingFields dict
    ↓
create_employee_draft   ← if no employee yet and name is known
  OR
update_employee_fields  ← if employee exists
    ↓
compute_onboarding_progress  ← recomputes the 7 steps from DB state
    ↓
_next_section(progress, employee)  ← finds next incomplete section
    ↓
llm_compose_reply(...)   ← gpt-4o-mini temp=0.4 natural reply
    ↓  (fallback: _template_reply)
onboarding_finishing structured_response  ← rendered by OnboardingFinishingCard
```

### LLM fallback behavior
`llm_available()` checks the API key. If the key is blank or any call throws:
- Extraction falls back to `extract_onboarding_entities` (regex, `extraction.py`).
- Reply falls back to `_template_reply` (e.g. `"(57%) Next, for payroll details: salary, bank account number, IFSC code, PAN number."`).
- Onboarding still completes end-to-end — the experience is just less natural.

### To test fallback
Temporarily blank the key in `.env`: `OPENAI_API_KEY=` → restart backend → onboard someone. Should still work, just robotic replies.

---

## 8. Common breakage points & how to fix them

### Backend won't start
- Check `alembic upgrade head` — missing migrations cause import errors.
- Check `.env` exists in `backend/` with `DATABASE_URL` pointing at a running Postgres.
- Run: `python -c "from app.main import app; print('OK')"` in the venv to surface the real error.

### "Employee not found" in agent
- The name-extraction cleaner strips filler words ("show profile of **employee** X" → X).
- If an employee still isn't found: check the spelling matches what's in the DB. The lookup uses `ilike` (case-insensitive substring). First + last combined both orders are tried.
- Debug: `GET /api/v1/employees?q=<name>` to confirm the DB record exists and the name matches.

### Onboarding % not updating after editing a field
- The Employees list fetches `onboarding_percent` from the API on a 15s interval. Force-refresh by clicking Refresh on the Employees page.
- If the % is wrong in the API too: check the 7-step conditions above against the actual DB row (`SELECT` the employee's fields in psql).

### Agent onboarding creates duplicate employees
- The coordinator reads the last 8 AgentRun rows to find an in-progress onboarding (`_latest_onboarding_finishing_employee_id`). If the conversation staled, a new "onboard X" command starts fresh.
- To clear a stuck session: manually soft-delete the test employee (`DELETE /employees/{id}`), then retry.

### LLM extraction wrong / field not captured
- Check the backend log (`INFO: Onboarding turn (source=llm) captured=...`) — it prints what was extracted each turn.
- If a field is missing: rephrase to be explicit, e.g. "bank account is 1234567890" instead of just the number.
- Known limitation: the LLM won't infer unstated fields (by design — it only extracts what's in the message).

### Email not sent / welcome step stuck
- `EMAIL_ENABLED=false` → email is logged, step still completes (returns `True`). This is the intended dev-mode behavior.
- `EMAIL_ENABLED=true` with wrong creds → `send_welcome_email` returns `False` → `welcome_kit_sent_at` is NOT stamped → step stays pending. Check SMTP settings in `.env`.
- Test the SMTP directly: run `python -m scripts.seed_auth` (which just seeds auth — the email path is in `app/services/email_service.py:send_welcome_email`).

### Document upload fails in agent chat
- The Attach button posts to `POST /api/v1/documents` (multipart: `employee_id`, `document_type`, `file`).
- The agent sets `awaiting_upload` in the response; the frontend reads it and routes Attach to the documents endpoint. If upload doesn't work, check `backend/uploads/documents/` exists and is writable.
- Accepted types: image/* and application/pdf (widened from resume-parser's pdf-only).

### Seat matrix doesn't appear
- Clicking "Open seat map" in the finishing card sets `seatingFor` state in `AgentCommandPage.tsx` → renders `SeatingAllocationModal`.
- If it doesn't open: check the browser console for a React error; confirm `employee_id` is in the structured_response.
- The `onAssigned` callback fires `commandMutation.mutate("continue onboarding")` so the loop continues — the coordinator routes it back to the onboarding agent via `_has_active_onboarding_finishing`.

### Graduation not happening (employee stuck in Onboarding at 100%)
- Both pages are client-side filtered from `GET /employees` which returns `onboarding_percent`.
- If the employee stays in Onboarding at 100%: hard-refresh the page (Vite hot-reload doesn't refetch stale queries). Or click Refresh on the Employees page.
- Check the API: `GET /api/v1/employees?page_size=50` — the `onboarding_percent` field should be 100.

---

## 9. Frontend rendering — Agent Command card types

`AgentCommandPage.tsx` dispatches on `structuredResponse.type`:

| type | Rendered by | When |
|---|---|---|
| `onboarding_finishing` | `OnboardingFinishingCard` | **Every onboarding turn** — bar + contextual action |
| `onboarding_progress_check` | `OnboardingProgressChecklistCard` | Agent progress query ("what's X's progress") |
| `employee_card` | `EmployeePreviewCard` | Profile lookup ("show profile of X") |
| `missing_fields` | `MissingFieldCard` | Old-style missing field prompt (mostly superseded) |
| `status_banner` | `StatusBannerCard` | "Sure, who are we onboarding?" initial prompt |

`OnboardingFinishingCard` shows:
1. The summary text (LLM's natural reply).
2. `OnboardingStatusPanel` — the identical numbered 7-step bar used on the profile page.
3. Contextual action for the current pending step: attach prompt / Open seat map / Send Welcome Mail / "now in Employees".

`OnboardingStatusPanel` (`frontend/src/components/employees/OnboardingStatusPanel.tsx`) is the shared component — used by both `EmployeeProfilePage` and the chat card so both show identical UI.

---

## 10. API quick-reference (admin token required)

```bash
# Get a token:
curl -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@example.com&password=ChangeMe123!"

# Employees list (includes onboarding_percent):
GET /api/v1/employees?page_size=50

# Employee onboarding progress (7-step breakdown):
GET /api/v1/employees/{id}/onboarding-progress

# Assign a seat:
POST /api/v1/employees/{id}/seat   body: {"seat_label": "A-3"}

# Send welcome mail:
POST /api/v1/employees/{id}/send-welcome-kit

# Upload a document:
POST /api/v1/documents   multipart: employee_id, document_type, file

# Agent Command (drives all chat):
POST /api/v1/agent-command/send   body: {"user_message": "..."}

# Health:
GET /api/v1/health
```
