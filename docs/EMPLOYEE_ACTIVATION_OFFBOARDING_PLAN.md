# Employee Activation (Invite) + Offboarding Plan — HRVIRTUAL

**Branch:** `new_RBAC`
**Builds on:** the already-merged RBAC + face-recognition work in `new_RBAC`.

## Context

Today HR creates an employee via `POST /employees` → `create_employee_draft()`
(`backend/app/agents/employee_agent/tools.py:364`). This auto-creates a linked `User`
with a **random unusable password** (`get_password_hash(uuid4().hex)`, line 377) and
`is_active=True`. There is **no way for the employee to ever log in** — no invite,
no password-reset, no activation link exists anywhere in the codebase. `email_service.py`
only has `send_welcome_email()` (plain text, no links).

Offboarding is a **placeholder** — `/offboarding` renders `PlaceholderPage`. "Deactivate"
only soft-deletes the Employee row; it does not disable the `User`, revoke tokens, vacate
the seat, return assets, or remove face enrollment.

**This plan delivers two flows:**
1. **Activation/Invite** — HR fills all critical info (unchanged). An activation link is
   emailed to the employee (auto on create + manual resend). The employee sets their own
   password (required) and optionally enrolls their face. HR owns everything else.
2. **Offboarding** — a guided checklist HR works through (asset return, seat release,
   knowledge transfer, exit interview, final settlement), then a **Finalize** action that
   cascades: EXITED status, disable login, revoke tokens, vacate seat, mark assets returned,
   remove face enrollment.

**Design decisions (confirmed):**
- Invite: **auto-send on creation + manual resend button**
- Offboarding: **guided checklist**, then finalize
- Activation page: **password required, face optional**

---

## PREREQUISITE FIX — face_login_attempts migration bug (BLOCKER)

The migration `backend/alembic/versions/a7ee3a56d3f3_add_face_auth_columns_and_table.py`
creates `face_login_attempts.employee_id → employees.id`, but the model
`FaceLoginAttempt` (`backend/app/models/auth/models.py`) declares `user_id → users.id`.
Inserts will fail at runtime.

**Fix:** add a new corrective migration `fix_face_login_attempts_user_fk`:
- Drop the existing FK constraint and `employee_id` column on `face_login_attempts`
  (table is empty — new feature, safe to drop).
- Add `user_id UUID NULL` with FK → `users.id` `ON DELETE SET NULL`.
- Ensure indexes match the model's `__table_args__`
  (`ix_face_login_attempts_user_id`, `ix_face_login_attempts_success`).

Run `alembic upgrade head` and confirm `\d face_login_attempts` shows `user_id → users.id`.

---

# PART A — Employee Activation / Invite Flow

## A1. Config

**File:** `backend/app/core/config.py` — add to `Settings`:

```python
# Employee activation / invite links
frontend_url: str = Field(default="http://localhost:5173", validation_alias="FRONTEND_URL")
activation_token_expire_hours: int = Field(default=72, validation_alias="ACTIVATION_TOKEN_EXPIRE_HOURS")
```

## A2. Model — ActivationToken + User.activated_at

**File:** `backend/app/models/auth/models.py`

Add `activated_at` to the `User` model (tracks pending vs activated without touching
`is_active`, which is reserved for offboarding):

```python
activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

Add a new model (mirrors the existing `RefreshToken` hashing pattern):

```python
class ActivationToken(BaseModel):
    """Single-use, expiring token for account activation / password reset."""

    __tablename__ = "activation_tokens"
    __table_args__ = (
        Index("ix_activation_tokens_user_id", "user_id"),
        Index("ix_activation_tokens_token_hash", "token_hash"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(30), nullable=False, default="activation")  # activation | password_reset
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship()
```

Register for Alembic in `backend/app/db/base.py`:
```python
from app.models.auth.models import ActivationToken  # noqa: F401
```

Generate migration:
```bash
alembic revision --autogenerate -m "add_activation_tokens_and_user_activated_at"
alembic upgrade head
```

## A3. Activation service

**File:** `backend/app/services/activation_service.py` (new)

Reuse `token_hash()` and `get_password_hash()` from `app/core/security.py`.

```python
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_password_hash, token_hash
from app.models.auth.models import ActivationToken, RefreshToken, User


def create_activation_token(db: Session, user: User, purpose: str = "activation") -> str:
    """Generate a raw token, store only its hash, return the raw token for the link."""
    raw = secrets.token_urlsafe(32)
    db.add(ActivationToken(
        user_id=user.id,
        token_hash=token_hash(raw),
        purpose=purpose,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=settings.activation_token_expire_hours),
    ))
    db.commit()
    return raw


def build_activation_link(raw_token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/activate?token={raw_token}"


def resolve_valid_token(db: Session, raw_token: str) -> ActivationToken | None:
    """Return the token row if it exists, is unused, and not expired — else None."""
    row = db.scalar(select(ActivationToken).where(ActivationToken.token_hash == token_hash(raw_token)))
    if not row or row.used_at is not None:
        return None
    if row.expires_at <= datetime.now(timezone.utc):
        return None
    return row


def activate_account(db: Session, raw_token: str, new_password: str) -> User | None:
    """Set password, stamp activated_at, mark token used. Returns the User or None if invalid."""
    row = resolve_valid_token(db, raw_token)
    if not row:
        return None
    user = db.get(User, row.user_id)
    if not user:
        return None
    user.password_hash = get_password_hash(new_password)
    user.activated_at = datetime.now(timezone.utc)
    user.is_active = True
    row.used_at = datetime.now(timezone.utc)
    # invalidate any other outstanding activation tokens for this user
    db.query(ActivationToken).filter(
        ActivationToken.user_id == user.id,
        ActivationToken.used_at.is_(None),
        ActivationToken.id != row.id,
    ).update({ActivationToken.used_at: datetime.now(timezone.utc)})
    db.commit()
    db.refresh(user)
    return user
```

## A4. Invite email

**File:** `backend/app/services/email_service.py` — add alongside `send_welcome_email`:

```python
def send_activation_email(employee, activation_link: str) -> bool:
    """Email the activation link to the employee's personal email."""
    if not settings.email_enabled:
        logger.info(f"Email disabled. Activation link for {employee.personal_email}: {activation_link}")
        return True
    if not employee.personal_email:
        logger.error("No personal email for activation invite")
        return False
    try:
        msg = EmailMessage()
        msg["Subject"] = "Activate your HRMS account"
        msg["From"] = settings.smtp_from or settings.smtp_user
        msg["To"] = employee.personal_email
        msg.set_content(f"""
Dear {employee.first_name or 'Employee'},

Your HR team has created your employee account. To finish setup, click the link
below to set your password and (optionally) enable face login:

{activation_link}

This link expires in {settings.activation_token_expire_hours} hours. If it expires,
ask HR to resend it.

Best regards,
HR Team
""")
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        logger.info(f"Activation email sent to {employee.personal_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send activation email: {e}")
        return False
```

When `EMAIL_ENABLED=false` (dev), the link is logged so devs can copy it.

## A5. Public activation endpoints

**File:** `backend/app/api/v1/endpoints/activation.py` (new). Router mounted under `/auth`.

```
GET /api/v1/auth/activation/{token}          (public)
  → resolve_valid_token(); 404/410 if invalid/expired
  → returns { valid: true, first_name, email, face_optional: true }
  (page uses this to render a greeting + know whether to offer the face step)

POST /api/v1/auth/activate                    (public)
  Body: { token: str, password: str }         (password validator: min length 8)
  → activate_account(db, token, password)
  → on success: AuthService(db).issue_tokens(user) → auto-login
  → returns TokenResponse (same schema as /auth/login)
  → 400 if token invalid/expired
```

After `/auth/activate` returns tokens, the frontend holds a valid session, so the
**optional face step reuses the existing** `POST /face-auth/me/enroll` (self-service,
already built) — no new face endpoint needed.

Wire into `backend/app/api/v1/router.py`:
```python
from app.api.v1.endpoints import activation
api_router.include_router(activation.router, prefix="/auth", tags=["activation"])
```

## A6. HR-facing invite endpoint (auto-send + resend)

**File:** `backend/app/api/v1/endpoints/employees.py`

Add a helper and endpoint (permission `employees:manage`, matching existing employee routes):

```
POST /api/v1/employees/{employee_id}/send-invite      (employees:manage)
  → load Employee → must have linked user_id and personal_email (else 400)
  → raw = create_activation_token(db, user)
  → link = build_activation_link(raw)
  → BackgroundTasks.add_task(send_activation_email, employee, link)
  → audit log "employee.invite_sent"
  → returns { sent: true, email: personal_email }
```

**Auto-send on creation:** in the existing `POST /employees` handler, after
`create_employee_draft()` succeeds and a **new** user was created with a `personal_email`,
generate a token and schedule `send_activation_email` as a `BackgroundTask` (same helper).
Guard so re-using an existing user does not re-invite. Do **not** change the random-password
line — activation overwrites it.

## A7. Frontend — public activation page

**File:** `frontend/src/pages/ActivatePage.tsx` (new), route `/activate` (public, outside
`ProtectedRoute`) in `frontend/src/routes/router.tsx`.

Flow:
1. Read `token` from query string. `GET /auth/activation/{token}` → if invalid, show
   "This link is invalid or expired — contact HR."
2. **Step 1 (required):** password + confirm password form → `POST /auth/activate`
   → store returned tokens exactly like `authStore.login` does (setState +
   `sessionStorage.setItem("agentic_hrms_refresh_token", ...)`).
3. **Step 2 (optional):** "Set up face login" using the existing `FaceCaptureModal`
   → `selfEnroll(images)` from `services/faceAuth.ts`. A "Skip for now" button proceeds.
4. Redirect to `/dashboard`.

**File:** `frontend/src/services/activation.ts` (new) — `getActivationInfo(token)`,
`activateAccount(token, password)` (returns `TokenResponse`). Mirror the fetch style in
`services/auth.ts`.

## A8. Frontend — resend button + invite status

**File:** `frontend/src/services/employees.ts` — add `sendInvite(employeeId)` →
`POST /employees/{id}/send-invite`.

**File:** `frontend/src/pages/EmployeeViewPage.tsx` (or the profile drawer) — show an
**Account** status chip driven by `user.activated_at`:
- "Pending activation" (amber) if not activated
- "Active" (green) if activated

Add a **"Resend invite"** button (visible to `employees:manage`) calling `sendInvite`.
Requires the employee API response to expose `account_activated` (see A9).

## A9. Expose activation status in employee API

**File:** `backend/app/schemas/employees.py` (+ the `employee_profile()` serializer in
`employee_agent/tools.py`) — include `account_activated: bool` derived from
`employee.user.activated_at is not None`. Add to the frontend `EmployeeRecord` type.

---

# PART B — Offboarding Flow (Guided Checklist)

## B1. New permission

**File:** `backend/app/services/auth_service.py`
- Add to `PERMISSIONS`: `"offboarding:manage": "Manage employee offboarding"`.
- Grant `offboarding:manage` to **Super Admin** (automatic) and **HR**.
- Re-run `python -m scripts.seed_auth`.

## B2. Model — exit fields + OffboardingCase

**File:** `backend/app/models/employee/models.py` — add to `Employee`:

```python
exit_date: Mapped[date | None] = mapped_column(Date)                 # last working day
exit_type: Mapped[str | None] = mapped_column(String(40))            # RESIGNATION | TERMINATION | RETIREMENT | END_OF_CONTRACT
exit_reason: Mapped[str | None] = mapped_column(Text)
offboarding_initiated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
offboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

Add an `ExitType` `StrEnum` next to `EmploymentStatus` for validation.

New model (holds HR-ticked manual items; auto-derived items are computed, not stored):

```python
class OffboardingCase(BaseModel):
    __tablename__ = "offboarding_cases"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="IN_PROGRESS")  # IN_PROGRESS | COMPLETED
    initiated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # HR-ticked manual checklist items
    knowledge_transfer_done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exit_interview_done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    final_settlement_done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    id_card_returned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    employee: Mapped["Employee"] = relationship()
```

Register in `db/base.py`, autogenerate + upgrade migration
`add_offboarding_case_and_employee_exit_fields`.

## B3. Offboarding progress service

**File:** `backend/app/services/offboarding_progress.py` (new) — mirror the existing
`onboarding_progress.py` `compute_onboarding_progress()` pattern. Returns a checklist that
**combines auto-derived state with manual flags**:

Auto-derived (read live state — read-only, HR can't fake them):
- **Assets returned** — all `EmployeeAsset` for the employee have status `RETURNED`
  (or none assigned). Uses existing asset status field.
- **Seat released** — `employee.seat_label is None`.
- **Access revoked** — `employee.user.is_active is False` (set at finalize).
- **Face removed** — `employee.user.face_registered is False`.

Manual (from `OffboardingCase`):
- knowledge_transfer_done, exit_interview_done, final_settlement_done, id_card_returned.

Return `{ percent, items: [{key,label,complete,auto}], can_finalize }` where
`can_finalize` is true only when all manual items are done (asset/seat/access/face are
handled by the finalize cascade itself).

## B4. Offboarding endpoints

**File:** `backend/app/api/v1/endpoints/offboarding.py` (new), prefix `/offboarding`.
All require `offboarding:manage` unless noted.

```
POST /api/v1/offboarding/{employee_id}/initiate
  Body: { exit_type, exit_reason, exit_date }
  → 400 if a non-completed case already exists
  → create OffboardingCase(status=IN_PROGRESS, initiated_by=current_user.id)
  → set employee.employment_status = NOTICE_PERIOD, exit_* fields, offboarding_initiated_at
  → audit "employee.offboarding_initiated"
  → returns case + computed checklist

GET  /api/v1/offboarding                      (offboarding:view)
  Query: ?status=IN_PROGRESS|COMPLETED
  → list employees with an offboarding case (name, exit_date, exit_type, status, percent)

GET  /api/v1/offboarding/{employee_id}        (offboarding:view)
  → case + compute_offboarding_progress()

PATCH /api/v1/offboarding/{employee_id}
  Body: partial { knowledge_transfer_done, exit_interview_done,
                  final_settlement_done, id_card_returned, notes }
  → update the OffboardingCase manual flags → return refreshed checklist

POST /api/v1/offboarding/{employee_id}/finalize
  → 400 unless compute_offboarding_progress().can_finalize is true
  → CASCADE (all in one transaction):
       employee.employment_status = EXITED
       employee.offboarding_completed_at = now; case.status = COMPLETED; case.completed_at = now
       user.is_active = False
       revoke all RefreshToken rows for the user (set revoked_at = now)
       vacate seat if seat_label set  → reuse seat_service.vacate_seat()
       mark every ASSIGNED/RETURN_PENDING EmployeeAsset as RETURNED (returned_at = now)
       if user.face_registered → face_service.remove_enrollment(str(user.id), db)
         + BackgroundTasks.add_task(face_service.retrain_classifier)
       any open ActivationToken for the user → mark used
  → audit "employee.offboarding_finalized"
  → returns final case + employee profile
```

Grant `offboarding:view` already exists (HR + Super Admin). Add `offboarding:manage`
per B1. Wire router in `router.py`.

**Clarify existing confusion:** leave the current `POST /employees/{id}/deactivate`
(soft-delete) as-is for now, but the Offboarding flow is the real exit path. Optionally
note in code that "deactivate" = quick soft-delete, "offboarding" = full lifecycle exit.

## B5. Frontend — Offboarding page (replace placeholder)

**File:** `frontend/src/pages/OffboardingPage.tsx` (new) — replace the `PlaceholderPage`
mapping for `/offboarding` in `frontend/src/routes/router.tsx`.

- Table of offboarding cases (`GET /offboarding`): Employee, Exit Type, Exit Date, Status,
  Progress %. Reuse `AppLayout`, `PageHeader`, `StatusBadge`, the shared data-table.
- "Start Offboarding" action opens a small form (exit_type dropdown, exit_date picker,
  exit_reason) → `POST /offboarding/{id}/initiate`. Employee picker limited to ACTIVE
  employees.
- Row click → **Offboarding detail drawer**: shows the computed checklist. Manual items
  render as toggles (`PATCH`); auto items render read-only with live status. A **Finalize
  Offboarding** button (disabled until `can_finalize`) → confirm dialog (reuse existing
  `ConfirmDialog`) → `POST /offboarding/{id}/finalize`.

**File:** `frontend/src/services/offboarding.ts` (new) — `listOffboarding`, `getOffboarding`,
`initiateOffboarding`, `updateOffboarding`, `finalizeOffboarding`. Mirror `services/employees.ts`.

The `/offboarding` route and sidebar entry already exist (`offboarding:view`) — only the
page component changes.

---

## Files Changed Summary

```
PREREQUISITE
  backend/alembic/versions/<ts>_fix_face_login_attempts_user_fk.py   NEW (fix employee_id → user_id)

PART A — Activation / Invite
  backend/app/core/config.py                         +frontend_url, activation_token_expire_hours
  backend/app/models/auth/models.py                  +ActivationToken, User.activated_at
  backend/app/db/base.py                             +ActivationToken import
  backend/app/services/activation_service.py         NEW
  backend/app/services/email_service.py              +send_activation_email
  backend/app/api/v1/endpoints/activation.py         NEW (public GET/POST activate)
  backend/app/api/v1/endpoints/employees.py          +send-invite endpoint, auto-send on create
  backend/app/agents/employee_agent/tools.py         employee_profile() +account_activated
  backend/app/schemas/employees.py                   +account_activated
  backend/app/api/v1/router.py                        +activation router
  backend/alembic/versions/<ts>_add_activation_tokens...py   NEW
  frontend/src/pages/ActivatePage.tsx                NEW (public)
  frontend/src/services/activation.ts                NEW
  frontend/src/services/employees.ts                 +sendInvite, EmployeeRecord.account_activated
  frontend/src/pages/EmployeeViewPage.tsx            +account status chip + resend button
  frontend/src/routes/router.tsx                     +/activate public route

PART B — Offboarding
  backend/app/services/auth_service.py               +offboarding:manage perm (+HR grant)
  backend/app/models/employee/models.py              +exit fields, ExitType, OffboardingCase
  backend/app/db/base.py                             +OffboardingCase import
  backend/app/services/offboarding_progress.py       NEW (mirror onboarding_progress.py)
  backend/app/api/v1/endpoints/offboarding.py        NEW (initiate/list/get/patch/finalize)
  backend/app/api/v1/router.py                        +offboarding router
  backend/alembic/versions/<ts>_add_offboarding...py NEW
  frontend/src/pages/OffboardingPage.tsx             NEW (replaces PlaceholderPage)
  frontend/src/services/offboarding.ts               NEW
  frontend/src/routes/router.tsx                     /offboarding → OffboardingPage

REUSED (no change)
  app/core/security.py  token_hash(), get_password_hash()
  app/services/auth_service.py  AuthService.issue_tokens()
  app/services/seat_service.py  vacate_seat()
  app/services/face_service.py  remove_enrollment(), retrain_classifier()
  frontend FaceCaptureModal.tsx, services/faceAuth.ts selfEnroll()
```

---

## Verification Checklist

### Prerequisite
```
[ ] alembic upgrade head — face_login_attempts has user_id → users.id
[ ] POST /face-auth/login (unknown face) → 401 AND a row inserts into face_login_attempts (no FK error)
```

### Part A — Activation
```
[ ] alembic upgrade head — activation_tokens table + users.activated_at exist
[ ] Create employee via POST /employees (personal_email set)
    → server log shows activation link (EMAIL_ENABLED=false) OR email delivered
    → users.activated_at is NULL for the new user
[ ] GET /auth/activation/{token} → { valid:true, first_name, email }
[ ] GET /auth/activation/BADTOKEN → 404/410
[ ] POST /auth/activate { token, password } → TokenResponse; users.activated_at set; token used_at set
[ ] Reusing the same token again → 400 (single-use)
[ ] POST /auth/login with the new password → succeeds
[ ] Optional face step: with returned token, POST /face-auth/me/enroll (5 imgs) → 200
[ ] POST /employees/{id}/send-invite (HR) → new token, email/log link
[ ] Employee token (not employees:manage) → 403 on send-invite
[ ] Frontend /activate?token=... → password step → optional face → redirect to dashboard
[ ] EmployeeViewPage shows "Pending activation" then "Active"; Resend invite works
```

### Part B — Offboarding
```
[ ] python -m scripts.seed_auth → offboarding:manage present; HR + Super Admin have it
[ ] alembic upgrade head — offboarding_cases + employee exit fields exist
[ ] POST /offboarding/{id}/initiate → case IN_PROGRESS; employee status NOTICE_PERIOD
[ ] GET /offboarding?status=IN_PROGRESS → lists the employee with progress %
[ ] GET /offboarding/{id} → checklist: manual items false, auto items reflect live state
[ ] PATCH /offboarding/{id} toggling manual items → percent rises; can_finalize true when all manual done
[ ] POST /offboarding/{id}/finalize BEFORE manual items done → 400
[ ] POST /offboarding/{id}/finalize when ready → cascade verified in DB:
      employment_status=EXITED; user.is_active=false; refresh tokens revoked;
      seat AVAILABLE + seat_label null; assets RETURNED; face_registered=false; case COMPLETED
[ ] Exited user POST /auth/login → 401 (inactive); existing refresh token → 401
[ ] Exited user face login → 401 (removed from classifier after retrain)
[ ] Employee token → 403 on all offboarding:manage endpoints
[ ] Frontend /offboarding → table renders; Start Offboarding → checklist drawer → Finalize
```
