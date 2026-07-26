# HRVIRTUAL HRMS — Developer Handoff

**Date:** 2026-07-23  
**Repo:** https://github.com/AkankshaSSPL/HRVIRTUAL  
**Branch:** `main`  
**DB:** PostgreSQL 16, database `hrms`, alembic head `20260723_0028`  
**Login:** `admin@example.com` / `ChangeMe123!`

---

## How to run

```powershell
# Backend
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head        # must be at 20260723_0028
python -m scripts.seed_auth
uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend
cd frontend
npm install
npm run dev -- --host 127.0.0.1   # runs on :5173
```

**Swagger:** http://127.0.0.1:8000/docs  
**Health:** http://127.0.0.1:8000/api/v1/health

---

## Key environment variables (`backend/.env`)

| Variable | Value / Purpose |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://postgres:password@localhost:5432/hrms` |
| `OPENAI_API_KEY` | Valid gpt-4o-mini key — powers conversational onboarding agent |
| `OPENAI_INTENT_ENABLED` | `false` — global routing stays rule-based; onboarding uses key directly |
| `EMAIL_ENABLED` | `true` |
| `SMTP_HOST/PORT/USER/PASSWORD/FROM` | Gmail SMTP (sipamara401@gmail.com) |

---

## What was built (complete)

### 1. Conversational LLM Onboarding Agent
- **How it works:** user types "onboard Ravi" → employee created immediately → 7-step progress bar appears in chat → agent asks for remaining details section by section (personal → employment → payroll → docs → seat → welcome mail → 100%)
- **LLM:** gpt-4o-mini via `backend/app/agents/onboarding_agent/llm.py`
- **Key files:**
  - `backend/app/agents/onboarding_agent/service.py` — main conversational loop
  - `backend/app/agents/onboarding_agent/llm.py` — LLM extraction + reply
  - `frontend/src/pages/AgentCommandPage.tsx` — renders `onboarding_finishing` card with progress bar
  - `frontend/src/components/employees/OnboardingStatusPanel.tsx` — shared 7-step bar (used in both profile + chat)
- **Fallback:** if OpenAI key missing/fails, falls back to regex extraction + templated replies. Onboarding still works.

### 2. Seating Layout
- **Model:** `Seat` in `backend/app/models/employee/models.py` — `seats` table, 43 rows seeded (A-Zone rows A-B, B-Zone rows C-E, 8 cols each + PANTRY/MEETING-A/MEETING-B)
- **API:** `GET /seats`, `POST /seats/{label}/assign`, `POST /seats/{label}/vacate`, `PATCH /seats/{label}/status`
- **Service:** `backend/app/services/seat_service.py`
- **UI:** `frontend/src/pages/SeatsPage.tsx` — floor grid, zone filters, side panel, occupancy stats
- **Seat modal:** `frontend/src/components/employees/SeatingAllocationModal.tsx` — now reads live DB occupancy (not hardcoded)
- **⚠️ NOT YET DONE:** `/seats` is not wired to the sidebar or router — page exists but can't navigate to it yet

### 3. Assets Module
- **Model:** `EmployeeAsset` in `models.py` — columns: `asset_type`, `asset_code`, `asset_status`, `asset_name` (via metadata_json for now), `assigned_at`, `returned_at`
- **API:** `GET /assets?employee_id=&status=`, `POST /assets`, `PATCH /assets/{id}`, `GET /assets/types`
- **Service:** `backend/app/api/v1/endpoints/assets.py`
- **Frontend service:** `frontend/src/services/assets.ts`
- **Profile:** asset allocation card shows on the employee profile/onboarding section; "Assets" tab in the profile drawer
- **Masters:** Asset Types card in Masters → Organization tab (8 types: Laptop/Monitor/Mouse/Keyboard/Headphones/Pendrive/Hard Disk/Mobile Device)
- **⚠️ NOT YET DONE:** `/assets` page still shows PlaceholderPage — the full management table (AssetsPage.tsx) is not built yet

### 4. 7-Step Onboarding Progress
Steps: Personal details → Employment details → Payroll readiness → Salary → Documents → Seating → Welcome mail  
At 100% → employee moves from Onboarding page to Employees page automatically.  
- `backend/app/services/onboarding_progress.py` — `compute_onboarding_progress(db, employee)`
- `frontend/src/components/employees/OnboardingStatusPanel.tsx` — shared bar used everywhere

### 5. Masters (11 total)
**Organization:** Departments, Designations, Employment Type, Employment Status, Gender, Candidate Status, Asset Type  
**Attendance & Leave:** Leave Types, Attendance Status, Leave Category, Leave Request Status

### 6. Other changes
- Attendance calendar removed — matrix only
- Welcome email sends via real SMTP on onboarding completion
- Agent employee lookup fixed ("show profile of employee X" now resolves correctly)
- Bank account extraction fixed in NLP ("bank 1234567890" now captured)
- Migration `0028` seeds 8 asset types — any dev just runs `alembic upgrade head`

---

## What is NOT done yet (remaining work)

See `docs/REMAINING_WORK_PLAN.md` for full details with file:line citations.

| Item | Effort | Key files |
|---|---|---|
| Wire `/seats` to sidebar + router | 10 min | `router.tsx`, `Sidebar.tsx` |
| Sync seat occupancy from existing employees | 10 min | `seat_service.py` or one SQL |
| Uncomment agent "onboard"/"hire" keywords | 5 min | `coordinator/service.py:68-70` |
| Profile tabs horizontal scroll (not wrapping) | 10 min | `BusinessResponseCards.tsx:748` |
| **AssetsPage** — full management table | 3–4 hrs | New `AssetsPage.tsx`, `router.tsx:31` |
| `asset_name` + `validity_date` columns migration | 15 min | New migration `0029`, `models.py` |
| Upload progress bar in agent chat | 30 min | `AgentCommandPage.tsx:~1167` |
| UAN + Aadhaar fields in employee create wizard | 30 min | `EmployeeCreateWizard.tsx` |

---

## DB migration chain

```
20260528_0001 → ... → 20260722_0026 (seat_label column)
→ 20260722_0027 (seats table + 43 rows seeded)
→ 20260723_0028 (asset_type lookup values seeded)  ← current HEAD
```

Run `alembic upgrade head` to get to the latest.

---

## Key architecture

```
React (Vite) :5173
      ↓
FastAPI :8000  /api/v1/*
      ↓
SQLAlchemy 2.0 → PostgreSQL 16 (hrms)
      ↓
OpenAI gpt-4o-mini  (onboarding agent LLM)
Gmail SMTP           (welcome email)
```

**Agent flow:** user message → `coordinator_agent/service.py` → routes to domain agent → `onboarding_agent/service.py` → LLM extracts fields → `create_employee_draft` / `update_employee_fields` → `compute_onboarding_progress` → LLM composes reply → `onboarding_finishing` response → rendered by `OnboardingFinishingCard` in chat.

---

## Docs in this repo

| File | Purpose |
|---|---|
| `docs/TESTING_AND_CONTEXT.md` | How to run, test flows, common breakages, debug queries |
| `docs/SEATING_ASSETS_CONTEXT.md` | Seat model, asset lifecycle, debug SQL, breakage fixes |
| `docs/SEATING_ASSETS_IMPLEMENTATION_PLAN.md` | Full build plan for seating + assets |
| `docs/REMAINING_WORK_PLAN.md` | Hyper-detailed plan for what's left (file:line citations) |
| `docs/ONBOARDING_IMPLEMENTATION_PLAN.md` | Onboarding agent architecture + flow |

---

## Common debug commands

```bash
# Check DB migration state
psql -U postgres -d hrms -c "SELECT version_num FROM alembic_version;"

# All seats + who's in them
psql -U postgres -d hrms -c "SELECT label, status, employee_id FROM seats ORDER BY label;"

# All assets by employee
psql -U postgres -d hrms -c "SELECT asset_type, asset_code, asset_status FROM employee_assets WHERE employee_id='<uuid>';"

# Asset types in lookup
psql -U postgres -d hrms -c "SELECT code, label FROM lookup_values WHERE category='asset_type' ORDER BY sort_order;"

# Backend health
curl http://127.0.0.1:8000/api/v1/health

# Swagger (all API routes)
open http://127.0.0.1:8000/docs
```
