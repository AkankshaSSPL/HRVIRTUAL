# NL Agent Architecture Redesign — HRVIRTUAL (Corrected)

**Status:** Plan only — not yet implemented  
**Branch:** `main`  
**Audited against:** full read of `coordinator_agent/service.py` lines 1–810  
**Correction from v1:** Previous plan used 6 separate triage tools (one per agent) which bypassed the routes dict, silently killing approval gates on leave, salary and payroll. This version is correct.

---

## What's Broken and Why

### Flaw 1 — Two elif ladders drive all routing

**Ladder 1:** `natural_language_extractor.extract()` → `_rule_extract()` in `natural_language.py` (25+ elif branches)  
**Ladder 2:** `_analyze_intent()` in `coordinator_agent/service.py` lines 522–644 (120-line elif ladder)

Both match hardcoded keyword strings from user input. Any phrase not literally in either list returns `unknown`. Example: "whats onboarding process of rahul" → unknown → AgentRun scan → wrong agent hijack.

### Flaw 2 — Three AgentRun scanning methods detect active state

```python
_has_active_onboarding_finishing()   # lines 664–681: scans last 8 AgentRun rows
_has_active_onboarding_draft()       # lines 646–662: scans last 8 AgentRun rows
_has_active_employee_confirmation()  # lines 683–699: scans last 10 AgentRun rows
```

O(N) DB queries per request. Create ghost-session bugs where old onboarding sessions hijack unrelated messages. No real conversation context — agents don't know what was said before.

---

## What the Coordinator Actually Does (Full Audit)

`submit_command()` has exactly three branches after routing. **All three are kept unchanged:**

```
Line 237 → if agent_name in known domain agents:
               _invoke_domain_agent()
               if result.approval_request_id → WAITING_FOR_APPROVAL
               else → COMPLETED + event type mapping
                      (EMPLOYEE_SEARCHED / ONBOARDING_STARTED / ATTENDANCE_RECORDED /
                       LOP_CALCULATED / ATTENDANCE_SUMMARY_GENERATED / LEAVE_APPLIED /
                       AGENT_COMPLETED)

Line 299 → elif route["approval_required"]:
               ApprovalEngineService.create_approval()
               WAITING_FOR_APPROVAL
               ← CRITICAL: this path bypasses the domain agent entirely
               ← used for "generate payroll", "approve leave", salary changes, etc.

Line 352 → else:
               _invoke_placeholder_agent()   ← offboarding_agent, notification_agent
               COMPLETED or FAILED
```

The route dict shape all three branches consume:
```python
{
    "matched_intent": str,       # e.g. "leave_approve", "onboarding"
    "agent_name": str,           # e.g. "leave_agent"
    "action": str,               # e.g. "approve"
    "approval_required": bool,   # True when action in agent.approval_required_actions
    "approval_module": str,      # e.g. "leave"
    "approval_action": str,      # e.g. "approve"
}
```

`_route_from_extraction()` (lines 453–497) already maps every intent string → this 4-tuple via a clean routes dict. That dict is kept unchanged. TriageAgent just picks the key.

---

## Why the Previous Plan Was Wrong

The v1 plan used 6 separate tools: `route_to_onboarding`, `route_to_leave`, etc. — one per agent. These only returned the agent name. The routes dict was bypassed, so:

- `action` was lost → event type mapping produced wrong events
- `approval_required` was never computed → approval gates on "approve leave", "generate payroll", salary changes silently stopped firing
- All three downstream branches broke

**The fix:** One tool with an intent enum. The enum values are exactly the keys in the routes dict. TriageAgent picks the key → routes dict gives back the full 4-tuple → everything downstream works unchanged.

---

## The Fix: Replace Lines 191–225 Only

### Removed from coordinator

| Lines | Code removed | Reason |
|---|---|---|
| 191–205 | `nl_extractor.extract()` + tracker steps | Replaced by TriageAgent |
| 206 | `fallback_route = self._analyze_intent(command, user_id)` | Replaced by TriageAgent |
| 207–208 | `fallback_is_meaningful`, `is_onboarding_continuation` | No longer needed |
| 209–222 | Missing-fields clarification gate + early return | TriageAgent always returns an intent |
| 224 | Route selection: `fallback_route if ... else _route_from_extraction() or fallback_route` | Replaced by intent lookup |
| 225 | `execution_command = extraction.canonical_command or command` | Use `command` directly |
| 499–520 | `_clarification_result()` method | No more clarification path |
| 522–644 | `_analyze_intent()` method (120-line elif ladder) | Replaced by TriageAgent |
| 646–662 | `_has_active_onboarding_draft()` method | Replaced by session |
| 664–681 | `_has_active_onboarding_finishing()` method | Replaced by session |
| 683–699 | `_has_active_employee_confirmation()` method | Replaced by session |
| Line 27 | `from app.agents.shared.natural_language import IntentExtraction, natural_language_extractor` | Unused |

### Added — replaces lines 191–225

```python
# ── 1. Session: load history, expire stale active_agent ──────────────
session_mgr = SessionManager(self.db)
session = session_mgr.get_or_create(user_id)
session_mgr.expire_if_stale(session)      # clears active_agent if > 30 min idle
history = session_mgr.get_history(session, n=10)

# ── 2. Triage: one LLM call → intent key ─────────────────────────────
triage = TriageAgent()
intent = triage.classify(command, history, session)

# ── 3. Route via existing routes dict (unchanged) ─────────────────────
route = self._route_from_extraction(_TriageExtraction(intent)) or \
        self._route("employee_agent", "inspect", "employee", "inspect", "general workforce")

self.tracker.step(run, step_name="triage_routing", status=AgentStepStatus.COMPLETED,
                  input_json={"command": command, "active_agent": session.active_agent},
                  output_json={"intent": intent, "route": route})
self.tracker.event(run, AgentEventType.TOOL_EXECUTED, "Triage classified intent",
                   "coordinator_agent", {"intent": intent, "agent": route["agent_name"]})

execution_command = command
```

### Added — session update at end of try block (before line 378)

```python
# ── Session: persist turn and update active_agent ─────────────────────
session_mgr.append(session, "user", command)
session_mgr.append(session, "assistant", result.get("message", ""),
                   agent=route["agent_name"],
                   metadata=result.get("structured_response"))

sr = result.get("structured_response") or {}
if sr.get("type") == "onboarding_finishing" and not sr.get("completed"):
    session_mgr.set_active(session, "onboarding_agent",
                           entity_id=sr.get("employee_id"),
                           entity_type="employee_onboarding")
elif sr.get("type") == "confirmation_card":
    session_mgr.set_active(session, "employee_agent")
elif sr.get("completed") or route["agent_name"] not in {"onboarding_agent", "employee_agent"}:
    session_mgr.clear_active(session)
```

### Updated — `run.metadata_json` at line 378

Replace `"intent_extraction": extraction.model_dump(mode="json")` with:
```python
"intent_extraction": {"intent": intent, "source": "triage_agent"},
```

### Shim class — top of `coordinator_agent/service.py` (outside the class)

```python
class _TriageExtraction:
    """Feeds TriageAgent intent string into unchanged _route_from_extraction()."""
    def __init__(self, intent: str) -> None:
        self.intent = intent
```

### Untouched in coordinator

- Lines 237–295 — domain agent dispatch + event type mapping
- Lines 299–350 — pre-execution approval (`route["approval_required"]`)
- Lines 352–376 — placeholder agents
- Lines 378–387 — metadata save + commit
- `_route()` method
- `_route_from_extraction()` method and its routes dict
- `_invoke_domain_agent()` method (except adding `history` + `active_entity_id` params)
- `_invoke_placeholder_agent()` method
- `_message_metadata()` method
- `CRITICAL_ACTION_KEYWORDS` dict
- `AGENT_DISPLAY_NAMES`, `ACTION_SUMMARIES` dicts

---

## TriageAgent

**New file:** `backend/app/agents/triage_agent/service.py`

One tool. Intent enum = exactly the keys in `_route_from_extraction()` routes dict. `tool_choice="required"` forces the LLM to always pick one. Falls back to `"employee_search"` on any failure.

```python
CLASSIFY_TOOL = {
    "type": "function",
    "function": {
        "name": "classify_intent",
        "description": "Classify this HR command into exactly one intent.",
        "parameters": {
            "type": "object",
            "properties": {
                "intent": {
                    "type": "string",
                    "enum": [
                        "employee_search", "employee_profile", "employee_confirmation",
                        "employee_update", "employee_deactivate",
                        "change_manager", "change_department",
                        "attendance_summary", "attendance_matrix",
                        "absent_employees", "mark_attendance",
                        "apply_leave", "cancel_leave", "leave_balance", "leave_history",
                        "leave_pending", "leave_approve", "leave_reject",
                        "leave_calendar", "create_leave_type",
                        "create_salary_component", "update_salary_component",
                        "delete_salary_component", "inspect_salary_components",
                        "create_salary_structure", "update_salary_structure",
                        "delete_salary_structure", "inspect_salary_structures",
                        "salary_breakup", "refresh_salary_breakups",
                        "salary_history", "assign_salary", "revise_salary",
                        "generate_payroll", "inspect_payroll",
                        "onboarding",
                    ]
                }
            },
            "required": ["intent"]
        }
    }
}


TRIAGE_SYSTEM_PROMPT = """\
You are the intent classifier for VirtualHR, an enterprise HRMS.
Call classify_intent with exactly one intent. Do not answer the user.

--- Priority rules (apply BEFORE normal classification) ---

1. ONBOARDING CONTINUATION
   session active_agent = "onboarding_agent" AND conversation history shows
   agent was collecting onboarding details (asking for email, PAN, bank account,
   seat, department, manager, etc.) AND current message provides that information
   (or is "yes" to send welcome mail) → "onboarding"

2. EMPLOYEE CONFIRMATION
   session active_agent = "employee_agent" AND last assistant message was a
   confirmation/diff card AND current message is one of:
   yes / no / confirm / proceed / apply / save / cancel / "yes update" /
   "do not update" / "don't update" → "employee_confirmation"

3. ONBOARDING STATUS QUERY — not a continuation
   Message asks about status, progress or process of onboarding for a named
   employee ("whats onboarding process of rahul", "where is priya in onboarding",
   "onboarding status of rahul") → "employee_profile"  (NOT "onboarding")

--- Classification examples ---
"onboard Raj as engineer"                 → "onboarding"
"hire Priya as developer"                 → "onboarding"
"show Rahul's profile"                    → "employee_profile"
"approve Rohan's leave"                   → "leave_approve"
"generate payroll for July"              → "generate_payroll"
"show salary breakup for Priya"          → "salary_breakup"
"give Rahul a 10 percent raise"          → "revise_salary"
"mark Priya present today"               → "mark_attendance"
"who was absent yesterday"               → "absent_employees"
"what salary structure does Priya have"  → "inspect_salary_structures"
"create a new salary component Basic"    → "create_salary_component"
"""


class TriageAgent:
    def __init__(self) -> None:
        self._client = OpenAI(api_key=settings.openai_api_key)

    def classify(self, message: str, history: list[dict], session: ConversationSession) -> str:
        system = TRIAGE_SYSTEM_PROMPT
        if session.active_agent:
            system += f"\n\nCurrent session active_agent: {session.active_agent}"

        messages = [
            {"role": "system", "content": system},
            *history,
            {"role": "user", "content": message},
        ]
        try:
            response = self._client.chat.completions.create(
                model=settings.openai_intent_model,
                messages=messages,
                tools=[CLASSIFY_TOOL],
                tool_choice="required",
                temperature=0,
                max_tokens=32,
            )
            args = json.loads(response.choices[0].message.tool_calls[0].function.arguments)
            intent = args.get("intent", "employee_search")
            logger.info("Triage: '%s...' → %s (active=%s)", message[:50], intent, session.active_agent)
            return intent
        except Exception:
            logger.exception("TriageAgent.classify() failed, defaulting to employee_search")
            return "employee_search"
```

---

## Session Infrastructure

### New models — `backend/app/models/agents/models.py`

Add after `AgentStep`:

```python
class ConversationSession(BaseModel):
    __tablename__ = "conversation_sessions"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    active_agent: Mapped[str | None] = mapped_column(String(120), nullable=True)
    active_entity_id: Mapped[UUID | None] = mapped_column(nullable=True)
    active_entity_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    messages: Mapped[list["ConversationMessage"]] = relationship(
        "ConversationMessage", back_populates="session",
        cascade="all, delete-orphan", order_by="ConversationMessage.created_at",
    )


class ConversationMessage(BaseModel):
    __tablename__ = "conversation_messages"

    session_id: Mapped[UUID] = mapped_column(
        ForeignKey("conversation_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)   # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    agent_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    session: Mapped["ConversationSession"] = relationship("ConversationSession", back_populates="messages")
```

### New migration — `backend/alembic/versions/20260729_0033_conversation_sessions.py`

```python
revision = "20260729_0033"
down_revision = "20260724_0032"

def upgrade():
    op.create_table("conversation_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("active_agent", sa.String(120), nullable=True),
        sa.Column("active_entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("active_entity_type", sa.String(120), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("uq_conv_session_user_active", "conversation_sessions", ["user_id"],
                    unique=True, postgresql_where=sa.text("deleted_at IS NULL"))
    op.create_index("ix_conv_sessions_expires", "conversation_sessions", ["expires_at"])

    op.create_table("conversation_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("agent_name", sa.String(120), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["conversation_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_conv_messages_session_created",
                    "conversation_messages", ["session_id", "created_at"])

def downgrade():
    op.drop_index("ix_conv_messages_session_created", "conversation_messages")
    op.drop_table("conversation_messages")
    op.drop_index("ix_conv_sessions_expires", "conversation_sessions")
    op.drop_index("uq_conv_session_user_active", "conversation_sessions")
    op.drop_table("conversation_sessions")
```

### SessionManager — `backend/app/services/session_manager.py`

```python
SESSION_TTL_MINUTES = 30

class SessionManager:
    def __init__(self, db: Session): self.db = db

    def get_or_create(self, user_id: UUID) -> ConversationSession:
        session = self.db.scalar(
            select(ConversationSession)
            .where(ConversationSession.user_id == user_id)
            .where(ConversationSession.deleted_at.is_(None))
        )
        if not session:
            now = datetime.now(timezone.utc)
            session = ConversationSession(
                user_id=user_id,
                last_activity_at=now,
                expires_at=now + timedelta(minutes=SESSION_TTL_MINUTES),
            )
            self.db.add(session)
            self.db.flush()
        return session

    def expire_if_stale(self, session: ConversationSession) -> None:
        now = datetime.now(timezone.utc)
        last = session.last_activity_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if (now - last).total_seconds() > SESSION_TTL_MINUTES * 60:
            session.active_agent = None
            session.active_entity_id = None
            session.active_entity_type = None

    def get_history(self, session: ConversationSession, n: int = 10) -> list[dict]:
        rows = self.db.scalars(
            select(ConversationMessage)
            .where(ConversationMessage.session_id == session.id)
            .where(ConversationMessage.deleted_at.is_(None))
            .order_by(ConversationMessage.created_at.desc())
            .limit(n)
        ).all()
        return [{"role": m.role, "content": m.content} for m in reversed(rows)]

    def append(self, session, role, content, agent=None, metadata=None):
        now = datetime.now(timezone.utc)
        self.db.add(ConversationMessage(
            session_id=session.id, role=role, content=content,
            agent_name=agent, metadata_json=metadata,
        ))
        session.last_activity_at = now
        session.expires_at = now + timedelta(minutes=SESSION_TTL_MINUTES)

    def set_active(self, session, agent, entity_id=None, entity_type=None):
        session.active_agent = agent
        session.active_entity_id = entity_id
        session.active_entity_type = entity_type

    def clear_active(self, session):
        session.active_agent = None
        session.active_entity_id = None
        session.active_entity_type = None
```

---

## OnboardingAgent — History + active_entity_id

**`backend/app/agents/onboarding_agent/service.py`**

Add params to `execute()` (line 64):
```python
def execute(self, *, command: str, user_id: UUID | None, workflow_id: str,
            history: list[dict] | None = None,
            active_entity_id: UUID | None = None) -> dict[str, Any]:
```

Update employee lookup (lines 77–80) — session entity_id takes priority over AgentRun scan:
```python
employee = None
if not _is_new_onboarding_command(command):
    if active_entity_id:
        employee = get_employee_by_id(self.db, active_entity_id)
    else:
        employee_id = _latest_onboarding_finishing_employee_id(self.db, user_id)
        employee = get_employee_by_id(self.db, employee_id) if employee_id else None
```

Forward `history` through `_turn()` → `llm_compose_reply()`.

**`backend/app/agents/onboarding_agent/llm.py`**

Add `history` param to `llm_compose_reply()`:
```python
def llm_compose_reply(*, name, percent, section_label, ask_for, just_captured,
                      completed, history: list[dict] | None = None) -> str:
    messages = [{"role": "system", "content": "You are a warm, concise HR onboarding assistant."}]
    if history:
        messages.extend(history[-4:])   # last 2 turns for context
    messages.append({"role": "user", "content": compose_prompt})
    reply = model.invoke(messages)
```

**`backend/app/agents/coordinator_agent/service.py` — `_invoke_domain_agent()`**

When `agent_name == "onboarding_agent"`, pass history + active_entity_id:
```python
result = OnboardingAgent(self.db).execute(
    command=command,
    user_id=context.user_id,
    workflow_id=context.workflow_id,
    history=history,
    active_entity_id=active_entity_id,
)
```

---

## File Summary

```
NEW:
  backend/app/agents/triage_agent/__init__.py
  backend/app/agents/triage_agent/service.py
  backend/app/services/session_manager.py
  backend/alembic/versions/20260729_0033_conversation_sessions.py

MODIFIED:
  backend/app/models/agents/models.py          (+ConversationSession +ConversationMessage)
  backend/app/models/agents/__init__.py         (+exports)
  backend/app/agents/coordinator_agent/service.py  (lines 191–225 replaced; scan methods removed)
  backend/app/agents/onboarding_agent/service.py   (history + active_entity_id)
  backend/app/agents/onboarding_agent/llm.py       (history in llm_compose_reply)

UNTOUCHED:
  backend/app/agents/shared/natural_language.py    (keep, just unused)
  All other domain agents
  All API endpoints
  Frontend
```

---

## Verification Checklist

- [ ] `alembic upgrade head` — `conversation_sessions` + `conversation_messages` tables created
- [ ] "approve Rohan's leave" → `leave_approve` → `route["approval_required"] = True` → ApprovalEngineService fires
- [ ] "generate payroll for July" → `generate_payroll` → approval gate fires
- [ ] "onboard Priya as engineer" → `onboarding` → employee created, progress card shown
- [ ] "priya@company.com" mid-onboarding → history context → `onboarding` → email captured
- [ ] "whats onboarding process of rahul" mid-onboarding → priority rule 3 → `employee_profile`
- [ ] "yes" after confirmation card → priority rule 2 → `employee_confirmation` → update executes
- [ ] Session expires after 30 min → fresh start, no ghost-session hijack
- [ ] `EMPLOYEE_SEARCHED`, `ONBOARDING_STARTED`, `LEAVE_APPLIED` events still fire correctly
- [ ] Placeholder agents (offboarding, notification) still return "not implemented"
