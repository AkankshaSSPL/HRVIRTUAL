# NL Agent Architecture Redesign — HRVIRTUAL

**Status:** Plan only — not yet implemented  
**Branch:** `main`  
**Estimated effort:** ~12 hrs / 1.5 days  
**Prior art:** OpenAI Agents SDK Handoffs pattern, FastAPI+PostgreSQL stateful agent templates

---

## Problem Statement

The current system has three structural flaws that compound as agents are added:

### Flaw 1 — Hardcoded 25-branch rule engine drives all routing
`backend/app/agents/shared/natural_language.py → _rule_extract()` (lines 209–311)  
Any phrasing not literally in the keyword list returns `intent="unknown"` at confidence 0.25.  
Adding new intents = adding new elif branches. Fragile at current size, unmaintainable at 2×.

### Flaw 2 — `_has_active_onboarding_finishing()` is a blunt global override
`backend/app/agents/coordinator_agent/service.py` lines 664–681  
Scans last 8 `AgentRun` rows. If ANY `onboarding_finishing` response is found incomplete, ALL subsequent messages from that user are silently hijacked to the onboarding agent — even clear status queries like "whats onboarding process of rahul".

### Flaw 3 — No conversation context reaches agents
`coordinator_agent/service.py → _invoke_domain_agent()` line 747:
```python
result = OnboardingAgent(self.db).execute(command=command, user_id=..., workflow_id=...)
```
Only the current message is passed. Agents have no memory of what was said before.  
The `llm_compose_reply()` function doesn't know what question it just asked.  
Each turn is reconstructed from scratch by scanning the DB.

---

## Solution: Triage Agent Pattern

Proven in production at scale. Used by OpenAI Agents SDK, Intercom's AI routing, enterprise HRMS chatbots.

**Core idea:**
> Replace the rule engine with a single LLM call — a "triage agent" — whose only job is to read the user's message and conversation history, then call exactly one routing function (OpenAI tool calling with `tool_choice="required"`). No keywords. No elif chains. Adding a new agent = adding one tool definition.

```
User message
      │
      ▼
SessionManager.get_or_create(user_id)
      │  → loads ConversationSession + last 10 messages
      │  → expires stale session if > 30 min idle
      ▼
TriageAgent.route(message, history, active_agent)
      │  → ONE gpt-4o-mini call with tool_choice="required"
      │  → returns agent name: "onboarding_agent" | "employee_agent" | ...
      │  → history context makes continuation detection automatic
      ▼
_invoke_domain_agent(agent_name, command, context, run, history, active_entity_id)
      │  → specialist receives current message + last 10 messages
      │  → onboarding LLM calls include history for coherent replies
      ▼
SessionManager.append(user_msg) + SessionManager.append(agent_reply)
SessionManager.set_active() or clear_active() based on result
      │
      ▼
Save AgentRun (unchanged — audit trail kept as-is)
```

---

## What Changes vs What Stays

| Component | Change | Reason |
|---|---|---|
| `natural_language.py` | Archive (stop calling it) | Replaced by TriageAgent |
| `coordinator_agent/service.py` | Partial rewrite (~100 lines) | New routing + session wiring |
| `onboarding_agent/service.py` | Add 2 optional params | Accept history + entity_id |
| `onboarding_agent/llm.py` | Update `llm_compose_reply` | Accept + use history |
| `models/agents/models.py` | Add 2 models | ConversationSession + ConversationMessage |
| New: `services/session_manager.py` | New file ~70 lines | Session CRUD |
| New: `agents/triage_agent/service.py` | New file ~90 lines | LLM routing |
| New: `alembic/versions/20260729_0033_*` | New migration | 2 new tables |
| All other agents (leave/attendance/payroll/salary/employee) | No change | Single-turn, work correctly |
| All API endpoints | No change | Same request/response |
| Frontend | No change | Same structured_response |
| HR DB models (Employee, Seat, Asset, etc.) | No change | Not involved |

---

## Implementation — Step by Step

### STEP 1 — Add DB models

**File:** `backend/app/models/agents/models.py`

Add these two classes at the bottom of the file, after the existing `AgentStep` class:

```python
class ConversationSession(BaseModel):
    """One active session per user. Tracks which agent currently owns the conversation
    and the last entity being acted on (e.g. the employee being onboarded)."""

    __tablename__ = "conversation_sessions"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    active_agent: Mapped[str | None] = mapped_column(String(120), nullable=True)
    active_entity_id: Mapped[UUID | None] = mapped_column(nullable=True)
    active_entity_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    messages: Mapped[list["ConversationMessage"]] = relationship(
        "ConversationMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ConversationMessage.created_at",
    )


class ConversationMessage(BaseModel):
    """One row per message turn. Ordered by created_at within a session.
    Provides the history window passed to triage and specialist agents."""

    __tablename__ = "conversation_messages"

    session_id: Mapped[UUID] = mapped_column(
        ForeignKey("conversation_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)        # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    agent_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    session: Mapped["ConversationSession"] = relationship(
        "ConversationSession", back_populates="messages"
    )
```

Add to the existing imports at top of `models.py` if not already present:
```python
from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
```

Export both new models from `backend/app/models/agents/__init__.py`:
```python
from app.models.agents.models import AgentRun, AgentRunStatus, AgentStep, AgentStepStatus, ConversationSession, ConversationMessage
```

---

### STEP 2 — Alembic migration

**New file:** `backend/alembic/versions/20260729_0033_conversation_sessions.py`

```python
"""add conversation_sessions and conversation_messages tables

Revision ID: 20260729_0033
Revises: 20260724_0032
Create Date: 2026-07-29 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "20260729_0033"
down_revision: Union[str, None] = "20260724_0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversation_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("active_agent", sa.String(120), nullable=True),
        sa.Column("active_entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("active_entity_type", sa.String(120), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # One active session per user (NULL deleted_at = active)
    op.create_index(
        "uq_conversation_sessions_user_active",
        "conversation_sessions",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index("ix_conversation_sessions_expires_at", "conversation_sessions", ["expires_at"])
    op.create_index("ix_conversation_sessions_tenant_id", "conversation_sessions", ["tenant_id"])

    op.create_table(
        "conversation_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("agent_name", sa.String(120), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["conversation_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_conversation_messages_session_created",
        "conversation_messages",
        ["session_id", "created_at"],
    )
    op.create_index("ix_conversation_messages_tenant_id", "conversation_messages", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_conversation_messages_tenant_id", table_name="conversation_messages")
    op.drop_index("ix_conversation_messages_session_created", table_name="conversation_messages")
    op.drop_table("conversation_messages")

    op.drop_index("ix_conversation_sessions_tenant_id", table_name="conversation_sessions")
    op.drop_index("ix_conversation_sessions_expires_at", table_name="conversation_sessions")
    op.drop_index("uq_conversation_sessions_user_active", table_name="conversation_sessions")
    op.drop_table("conversation_sessions")
```

---

### STEP 3 — SessionManager service

**New file:** `backend/app/services/session_manager.py`

```python
"""Manages ConversationSession and ConversationMessage records.

One session per user. Session tracks which agent currently "owns" the
conversation and which entity (e.g. the employee being onboarded) is the
active subject. Sessions expire after SESSION_TTL_MINUTES of inactivity —
stale sessions are reset (active_agent cleared) so old onboarding ghosts
don't hijack unrelated new messages.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models.agents.models import ConversationMessage, ConversationSession

SESSION_TTL_MINUTES = 30


class SessionManager:
    def __init__(self, db: DbSession) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------

    def get_or_create(self, user_id: UUID) -> ConversationSession:
        """Return the user's active session or create a fresh one."""
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
        """If idle longer than SESSION_TTL_MINUTES, clear active agent.
        This prevents a ghost onboarding session from hijacking fresh queries."""
        now = datetime.now(timezone.utc)
        last = session.last_activity_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if (now - last).total_seconds() > SESSION_TTL_MINUTES * 60:
            session.active_agent = None
            session.active_entity_id = None
            session.active_entity_type = None

    # ------------------------------------------------------------------
    # Message history
    # ------------------------------------------------------------------

    def get_history(self, session: ConversationSession, n: int = 10) -> list[dict]:
        """Return last n messages as OpenAI-compatible dicts [{role, content}].
        Ordered oldest-first (chronological) so LLM reads them naturally."""
        rows = self.db.scalars(
            select(ConversationMessage)
            .where(ConversationMessage.session_id == session.id)
            .where(ConversationMessage.deleted_at.is_(None))
            .order_by(ConversationMessage.created_at.desc())
            .limit(n)
        ).all()
        return [{"role": m.role, "content": m.content} for m in reversed(rows)]

    def append(
        self,
        session: ConversationSession,
        role: str,                            # "user" | "assistant"
        content: str,
        agent: str | None = None,
        metadata: dict | None = None,
    ) -> None:
        """Append a message and refresh the session TTL."""
        now = datetime.now(timezone.utc)
        self.db.add(
            ConversationMessage(
                session_id=session.id,
                role=role,
                content=content,
                agent_name=agent,
                metadata_json=metadata,
            )
        )
        session.last_activity_at = now
        session.expires_at = now + timedelta(minutes=SESSION_TTL_MINUTES)

    # ------------------------------------------------------------------
    # Active agent tracking
    # ------------------------------------------------------------------

    def set_active(
        self,
        session: ConversationSession,
        agent: str,
        entity_id: UUID | None = None,
        entity_type: str | None = None,
    ) -> None:
        session.active_agent = agent
        session.active_entity_id = entity_id
        session.active_entity_type = entity_type

    def clear_active(self, session: ConversationSession) -> None:
        session.active_agent = None
        session.active_entity_id = None
        session.active_entity_type = None
```

---

### STEP 4 — TriageAgent service

**New file:** `backend/app/agents/triage_agent/__init__.py` (empty)

**New file:** `backend/app/agents/triage_agent/service.py`

```python
"""Triage Agent — routes user messages to the correct specialist agent.

This is a ROUTING ONLY component. It makes one gpt-4o-mini call with
tool_choice="required" so the model must pick exactly one of the defined
routing tools. No keyword rules. No elif chains.

Adding a new specialist agent = add one entry to TRIAGE_TOOLS.

Conversation history is passed as context so continuation messages
("priya@company.com" after "what's her email?") naturally route back
to the onboarding agent without any AgentRun scanning hacks.
"""
from __future__ import annotations

import logging
from openai import OpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)


TRIAGE_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "route_to_onboarding",
            "description": (
                "New hire onboarding — collecting personal details, employment info, "
                "payroll/bank details, document upload, seat assignment, welcome mail. "
                "Use for: 'onboard X', 'hire X as Y', 'start onboarding for X', "
                "AND for bare continuation replies when the conversation history shows "
                "the agent was mid-onboarding (asking for email, department, bank account, etc.)."
            ),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "route_to_employee",
            "description": (
                "Employee lookup, profile, search, update personal/employment details, "
                "onboarding STATUS or PROGRESS queries ('what is X's onboarding status', "
                "'how far is X in onboarding', 'whats the onboarding process of X', "
                "'onboarding progress of X'), manager reassignment, department change, "
                "employee deactivation."
            ),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "route_to_leave",
            "description": (
                "Leave applications (apply, cancel), leave approvals and rejections, "
                "leave balance inquiry, leave history, pending leave approvals list, "
                "leave calendar, creating new leave types."
            ),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "route_to_attendance",
            "description": (
                "Mark attendance (present/absent/WFH/half-day/on-duty), "
                "attendance summary for an employee, attendance matrix view, "
                "list of absent employees for a date."
            ),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "route_to_payroll",
            "description": (
                "Generate payroll for a month, inspect/view payroll runs, "
                "payroll processing status."
            ),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "route_to_salary",
            "description": (
                "Salary breakup for an employee, salary history, "
                "assign salary structure to an employee, revise/increase/decrease salary, "
                "create/update/delete salary components (earnings/deductions), "
                "create/update/delete salary structures, refresh salary breakups for all employees."
            ),
        },
    },
]


TRIAGE_SYSTEM_PROMPT = """\
You are the routing layer for VirtualHR, an enterprise HRMS.
Your ONLY job: read the user's message and the conversation history, then call exactly one routing function.
Do NOT answer the user. Do NOT explain. Only call one routing function.

Priority rules (apply in order):
1. If the conversation history shows an active onboarding collection \
(the assistant was asking for email, department, bank account, PAN, seat, etc.) \
AND the current message is a direct reply providing that information \
→ route_to_onboarding
2. If the message asks about an employee's onboarding STATUS, PROGRESS, or PROCESS \
('what is X's onboarding status', 'onboarding process of X', 'how far is X in onboarding') \
→ route_to_employee
3. 'onboard X', 'hire X as Y', 'start onboarding for X' \
→ route_to_onboarding
4. Everything else → pick the most semantically appropriate specialist.
"""


# Maps tool function name → agent name used in coordinator dispatch
TOOL_TO_AGENT: dict[str, str] = {
    "route_to_onboarding":  "onboarding_agent",
    "route_to_employee":    "employee_agent",
    "route_to_leave":       "leave_agent",
    "route_to_attendance":  "attendance_agent",
    "route_to_payroll":     "payroll_agent",
    "route_to_salary":      "salary_assignment_agent",
}

# Safe default (action, approval_module, approval_action) per agent.
# The actual business action is determined inside each specialist agent.
AGENT_DEFAULT_ROUTE: dict[str, tuple[str, str, str]] = {
    "onboarding_agent":        ("start",    "onboarding",         "start"),
    "employee_agent":          ("inspect",  "employee",           "inspect"),
    "leave_agent":             ("inspect",  "leave",              "inspect"),
    "attendance_agent":        ("show",     "attendance",         "inspect"),
    "payroll_agent":           ("process",  "payroll",            "process"),
    "salary_assignment_agent": ("inspect",  "salary_assignment",  "inspect"),
    "salary_structure_agent":  ("inspect",  "payroll",            "inspect"),
}


class TriageAgent:
    """Routes a user message to the correct specialist agent via a single LLM call."""

    def __init__(self) -> None:
        self._client = OpenAI(api_key=settings.openai_api_key)

    def route(
        self,
        message: str,
        history: list[dict],             # OpenAI-format [{role, content}]
        active_agent: str | None = None, # from ConversationSession
    ) -> str:
        """Return the specialist agent name to invoke.

        Falls back to "employee_agent" on any failure — this is always safe
        because EmployeeAgent handles unknown queries gracefully.
        """
        system_prompt = TRIAGE_SYSTEM_PROMPT
        if active_agent:
            system_prompt += (
                f"\n\nContext: the previous turn was handled by {active_agent}. "
                "If this message is a natural continuation of that conversation, route there."
            )

        messages = [
            {"role": "system", "content": system_prompt},
            *history,   # full history window as OpenAI message objects
            {"role": "user", "content": message},
        ]

        try:
            response = self._client.chat.completions.create(
                model=settings.openai_intent_model,   # "gpt-4o-mini"
                messages=messages,
                tools=TRIAGE_TOOLS,
                tool_choice="required",   # must pick exactly one tool, no free text
                temperature=0,
                max_tokens=64,            # routing only — tiny output needed
            )
            tool_name = response.choices[0].message.tool_calls[0].function.name
            agent = TOOL_TO_AGENT.get(tool_name, "employee_agent")
            logger.info("Triage: '%s...' → %s (tool=%s)", message[:50], agent, tool_name)
            return agent

        except Exception:
            logger.exception("TriageAgent.route() failed, falling back to employee_agent")
            return "employee_agent"
```

---

### STEP 5 — Coordinator rewrite

**File:** `backend/app/agents/coordinator_agent/service.py`

#### 5a — New imports (add at top, alongside existing imports)

```python
from app.agents.triage_agent.service import TriageAgent, AGENT_DEFAULT_ROUTE
from app.services.session_manager import SessionManager
```

Remove this import (no longer needed):
```python
from app.agents.shared.natural_language import IntentExtraction, natural_language_extractor
```

#### 5b — Replace `submit_command()` routing block

The current routing block spans lines **190–350** approximately (from `extraction = natural_language_extractor.extract(command)` through the approval-request creation block).

**Replace the entire block from line 190 to line 350** with:

```python
        # ── 1. Session: load history, expire stale active-agent ──────────────
        session_mgr = SessionManager(self.db)
        session = session_mgr.get_or_create(user_id)
        session_mgr.expire_if_stale(session)
        history = session_mgr.get_history(session, n=10)

        # ── 2. Triage: one LLM call → agent name ─────────────────────────────
        triage = TriageAgent()
        agent_name = triage.route(command, history, session.active_agent)

        # ── 3. Build route dict (for tracker + approval flow) ─────────────────
        action, approval_module, approval_action = AGENT_DEFAULT_ROUTE.get(
            agent_name, ("inspect", "employee", "inspect")
        )
        route = self._route(agent_name, action, approval_module, approval_action, "triage")

        self.tracker.step(
            run,
            step_name="triage_routing",
            status=AgentStepStatus.COMPLETED,
            input_json={"command": command, "active_agent": session.active_agent},
            output_json={"agent_name": agent_name, "history_length": len(history)},
        )
        self.tracker.event(
            run, AgentEventType.TOOL_EXECUTED,
            f"Triage routed to {agent_name}", "coordinator_agent",
            {"agent_name": agent_name},
        )

        state.current_agent = agent_name
        state.current_step = "agent_selection"
        self.tracker.step(run, step_name="agent_selection", status=AgentStepStatus.COMPLETED, output_json=route)
        self.tracker.event(run, AgentEventType.AGENT_STARTED, f"Selected {agent_name}", agent_name, route)

        context = RuntimeContext(workflow_id=state.workflow_id, user_id=user_id, correlation_id=state.workflow_id)

        # ── 4. Invoke specialist ──────────────────────────────────────────────
        result = self._invoke_domain_agent(
            route, command, context, run,
            history=history,
            active_entity_id=session.active_entity_id,
        )

        if result.get("approval_request_id"):
            state.workflow_status = WorkflowStatus.COMPLETED
            state.current_step = "approval_interrupt"
            state.messages.append(AgentMessage(
                type=AgentMessageType.APPROVAL,
                content=result["message"],
                agent_name=agent_name,
                metadata=result,
            ))
            self.tracker.step(run, step_name="approval_interrupt", status=AgentStepStatus.PENDING,
                              output_json={"approval_request_id": result["approval_request_id"]})
            self.tracker.event(run, AgentEventType.APPROVAL_REQUIRED,
                               f"{agent_name} paused for approval", agent_name,
                               {"approval_request_id": result["approval_request_id"]})
            run.status = AgentRunStatus.WAITING_FOR_APPROVAL
        else:
            state.workflow_status = WorkflowStatus.COMPLETED
            state.current_step = "completed"
            state.result = result
            state.messages.append(AgentMessage(
                type=AgentMessageType.AGENT,
                content=result["message"],
                agent_name=agent_name,
                metadata=result,
            ))
            run.status = AgentRunStatus.COMPLETED
            run.completed_at = datetime.now(timezone.utc)
            if state.messages[-1].metadata:
                state.messages[-1].metadata["completed_at"] = run.completed_at.isoformat()
                state.messages[-1].metadata["duration_ms"] = (
                    int((run.completed_at - run.started_at).total_seconds() * 1000)
                    if run.started_at else None
                )

        # ── 5. Persist session ────────────────────────────────────────────────
        session_mgr.append(session, "user", command)
        session_mgr.append(
            session, "assistant",
            result.get("message", ""),
            agent=agent_name,
            metadata=result.get("structured_response"),
        )

        sr = result.get("structured_response") or {}
        if sr.get("type") == "onboarding_finishing" and not sr.get("completed"):
            session_mgr.set_active(
                session, "onboarding_agent",
                entity_id=sr.get("employee_id"),
                entity_type="employee_onboarding",
            )
        elif sr.get("completed") or agent_name != "onboarding_agent":
            # Query agents (employee, leave, etc.) don't change the active onboarding session
            if agent_name not in {"employee_agent", "attendance_agent"} or sr.get("completed"):
                session_mgr.clear_active(session)
```

> **Note:** Keep the final `run.metadata_json = ...` and `self.tracker.finish(run, ...)` lines that currently follow the routing block — they are unchanged.

#### 5c — Update `_invoke_domain_agent()` signature

Current signature (line 745):
```python
def _invoke_domain_agent(self, route: dict[str, Any], command: str, context: RuntimeContext, run: AgentRun) -> dict[str, Any]:
```

New signature:
```python
def _invoke_domain_agent(
    self,
    route: dict[str, Any],
    command: str,
    context: RuntimeContext,
    run: AgentRun,
    history: list[dict] | None = None,
    active_entity_id: UUID | None = None,
) -> dict[str, Any]:
```

Update the onboarding agent invocation inside the method (line 747):
```python
# OLD:
result = OnboardingAgent(self.db).execute(command=command, user_id=context.user_id, workflow_id=context.workflow_id)

# NEW:
result = OnboardingAgent(self.db).execute(
    command=command,
    user_id=context.user_id,
    workflow_id=context.workflow_id,
    history=history,
    active_entity_id=active_entity_id,
)
```

All other agent invocations in `_invoke_domain_agent()` are unchanged.

#### 5d — Methods to remove entirely

Delete these private methods from the class (they are completely replaced by TriageAgent + SessionManager):

- `_analyze_intent()` (lines ~522–644)
- `_has_active_onboarding_draft()` (lines ~646–662)
- `_has_active_onboarding_finishing()` (lines ~664–681)
- `_has_active_employee_confirmation()` (lines ~683–699)
- `_route_from_extraction()` (lines ~453–497)
- `_clarification_result()` (lines ~499–520)

Keep all other methods unchanged:
- `submit_command()` — updated per step 5b
- `get_workflow()`, `list_workflows()`, `list_events()` — unchanged
- `_route()` — unchanged (still needed to build route dict)
- `_invoke_domain_agent()` — updated per 5c
- `_invoke_placeholder_agent()` — unchanged
- `_message_metadata()` — unchanged

---

### STEP 6 — Update OnboardingAgent

**File:** `backend/app/agents/onboarding_agent/service.py`

#### 6a — Update `execute()` signature (line 64)

```python
# CURRENT:
def execute(self, *, command: str, user_id: UUID | None, workflow_id: str) -> dict[str, Any]:

# NEW:
def execute(
    self,
    *,
    command: str,
    user_id: UUID | None,
    workflow_id: str,
    history: list[dict] | None = None,       # conversation history from SessionManager
    active_entity_id: UUID | None = None,    # employee.id from ConversationSession
) -> dict[str, Any]:
```

#### 6b — Update employee lookup (lines 77–80)

```python
# CURRENT:
employee = None
if not _is_new_onboarding_command(command):
    employee_id = _latest_onboarding_finishing_employee_id(self.db, user_id)
    employee = get_employee_by_id(self.db, employee_id) if employee_id else None

# NEW:
employee = None
if not _is_new_onboarding_command(command):
    if active_entity_id:
        # Prefer session-provided entity (no DB scanning needed)
        employee = get_employee_by_id(self.db, active_entity_id)
    else:
        # Backward-compatible fallback: scan AgentRun records
        # (used during transition period before all sessions are active)
        employee_id = _latest_onboarding_finishing_employee_id(self.db, user_id)
        employee = get_employee_by_id(self.db, employee_id) if employee_id else None
```

#### 6c — Pass history to `_turn()` 

Update the `_turn()` call (line 94):
```python
# CURRENT:
return self._turn(employee=employee, command=command, workflow_id=workflow_id, just_captured=just_captured)

# NEW:
return self._turn(
    employee=employee,
    command=command,
    workflow_id=workflow_id,
    just_captured=just_captured,
    history=history,
)
```

Update `_turn()` signature to accept and forward `history` to `llm_compose_reply`.  
Find `_turn()` method and add `history: list[dict] | None = None` param, then pass it through to the `llm_compose_reply()` call.

#### 6d — Also update `invoke()` (line 62)

```python
# CURRENT:
return self.execute(command=payload.get("command", ""), user_id=context.user_id, workflow_id=context.workflow_id)

# NEW:
return self.execute(
    command=payload.get("command", ""),
    user_id=context.user_id,
    workflow_id=context.workflow_id,
    history=payload.get("history"),
    active_entity_id=payload.get("active_entity_id"),
)
```

---

### STEP 7 — Update llm_compose_reply

**File:** `backend/app/agents/onboarding_agent/llm.py`

Update `llm_compose_reply()` (starting line 89):

```python
def llm_compose_reply(
    *,
    name: str,
    percent: int,
    section_label: str,
    ask_for: list[str],
    just_captured: dict[str, Any] | None,
    completed: bool,
    history: list[dict] | None = None,   # NEW: conversation history from session
) -> str:
    """Compose the assistant's next natural line.
    With history, the reply is coherent across turns ('Got your email — now I need
    your department.'). Without history, falls back to stateless compose."""
    from langchain_openai import ChatOpenAI

    model = ChatOpenAI(
        model=settings.openai_intent_model,
        api_key=settings.openai_api_key,
        temperature=0.4,
    )
    captured_summary = (
        ", ".join(f"{k}={v}" for k, v in (just_captured or {}).items()) or "nothing new"
    )

    if completed:
        compose_prompt = (
            f"You are a warm, concise HR onboarding assistant.\n"
            f"{name}'s onboarding just reached 100% complete and they now appear in the Employees list.\n"
            f"Write ONE short, friendly sentence confirming that. No preamble, no bullet points."
        )
    else:
        compose_prompt = (
            f"You are a warm, concise HR onboarding assistant guiding an HR user "
            f"through onboarding {name} (currently {percent}% complete).\n"
            f"You just recorded: {captured_summary}.\n"
            f"Next you need ({section_label}): {', '.join(ask_for)}.\n"
            f"Write ONE short, natural sentence: briefly acknowledge what was just recorded "
            f"(only if something was), then ask for the next details conversationally. "
            f"Do not use bullet points or a robotic 'Please provide:' list. No preamble."
        )

    # Build messages list — include last 4 history messages (2 turns) when available
    # so the reply is contextually aware without ballooning the prompt
    messages: list[dict] = [{"role": "system", "content": "You are a helpful HR onboarding assistant."}]
    if history:
        messages.extend(history[-4:])
    messages.append({"role": "user", "content": compose_prompt})

    reply = model.invoke(messages)
    text = str(getattr(reply, "content", "") or "").strip()
    if not text:
        raise RuntimeError("Empty LLM reply")
    return text
```

---

### STEP 8 — Config update

**File:** `backend/app/core/config.py`

The `openai_intent_enabled` setting was previously for the NL extractor (which is now archived). Keep it for backward compatibility but it's no longer used in routing. No change required.

Optionally add a triage-specific guard:
```python
triage_enabled: bool = True  # set False to disable TriageAgent (falls back to employee_agent)
```

In `TriageAgent.route()`, wrap the OpenAI call:
```python
if not settings.openai_api_key or not getattr(settings, "triage_enabled", True):
    logger.warning("TriageAgent: no API key or triage disabled, defaulting to employee_agent")
    return "employee_agent"
```

---

### STEP 9 — Archive NaturalLanguageExtractor

**File:** `backend/app/agents/shared/natural_language.py`

Do NOT delete. Just stop importing it in the coordinator (already done in step 5a).

The file remains available as a fallback reference and for any places that still call it directly (e.g. if anything else imports `natural_language_extractor`). Grep for usages:

```powershell
Select-String -Path "backend\app\**\*.py" -Pattern "natural_language_extractor|NaturalLanguageExtractor" -Recurse
```

If only coordinator imports it, removing the coordinator import is sufficient. The file stays.

---

## Verification Checklist

Run after implementing all steps:

### DB / Migration
- [ ] `alembic upgrade head` succeeds with migration `20260729_0033`
- [ ] `conversation_sessions` and `conversation_messages` tables exist in DB
- [ ] `psql -d hrms -c "\d conversation_sessions"` shows all columns

### Session Lifecycle
- [ ] First message creates a `ConversationSession` row for the user
- [ ] Second message reuses the same session (no new row)
- [ ] `last_activity_at` and `expires_at` update after each message
- [ ] `expire_if_stale()` clears `active_agent` when last activity > 30 min ago

### Triage Routing
- [ ] `"onboard Raj as engineer"` → triage returns `"onboarding_agent"`
- [ ] `"approve Rohan's leave"` → triage returns `"leave_agent"`
- [ ] `"generate payroll for July"` → triage returns `"payroll_agent"`
- [ ] `"show salary breakup for Priya"` → triage returns `"salary_assignment_agent"`
- [ ] `"who was absent today"` → triage returns `"attendance_agent"`
- [ ] `"whats onboarding process of rahul"` → triage returns `"employee_agent"` (NOT onboarding)

### Active Session + Continuation
- [ ] After onboarding starts: `session.active_agent = "onboarding_agent"`, `session.active_entity_id = <employee UUID>`
- [ ] Bare reply `"priya@company.com"` during active onboarding → triage sees history → returns `"onboarding_agent"`
- [ ] `"whats onboarding process of rahul"` DURING active onboarding → triage returns `"employee_agent"` (query, not continuation)
- [ ] Welcome mail sent (completed=true) → `session.active_agent = None`

### Onboarding Flow End-to-End
- [ ] Turn 1: `"onboard Priya as backend engineer"` → employee created, 7-step card shown at 0%
- [ ] Turn 2: `"priya@example.com"` → captured, progress increases, next question asked
- [ ] Turn 3: `"Engineering, reports to Rahul Mehta"` → both captured
- [ ] Replies reference prior context (e.g., "Got Priya's email — now I need her bank details")

### No Regression on Single-Turn Agents
- [ ] Leave apply, approve, reject, balance all route correctly
- [ ] Attendance marking works
- [ ] Payroll generation works
- [ ] Salary breakup and revision work
- [ ] Employee profile/search works

---

## How to Add a New Agent After This Change

Example: adding an `expense_agent` for expense claims.

1. Add to `TRIAGE_TOOLS` in `triage_agent/service.py`:
```python
{
    "type": "function",
    "function": {
        "name": "route_to_expense",
        "description": "Expense claims — submit, approve, reject, view history.",
    },
},
```

2. Add to `TOOL_TO_AGENT`:
```python
"route_to_expense": "expense_agent",
```

3. Add to `AGENT_DEFAULT_ROUTE`:
```python
"expense_agent": ("inspect", "expense", "inspect"),
```

4. Add `expense_agent` to the dispatch in `coordinator_agent/service.py → _invoke_domain_agent()`:
```python
elif route["agent_name"] == "expense_agent":
    result = ExpenseAgent(self.db).execute(action=route["action"], command=command, ...)
    step_name = "expense_agent_execution"
```

**That's it. Zero changes to routing logic, zero new keyword rules.**

---

## File Change Summary

```
NEW FILES:
  backend/app/agents/triage_agent/__init__.py
  backend/app/agents/triage_agent/service.py
  backend/app/services/session_manager.py
  backend/alembic/versions/20260729_0033_conversation_sessions.py

MODIFIED FILES:
  backend/app/models/agents/models.py            (+ConversationSession, +ConversationMessage)
  backend/app/models/agents/__init__.py           (+export new models)
  backend/app/agents/coordinator_agent/service.py (routing rewrite + session wiring)
  backend/app/agents/onboarding_agent/service.py  (history + active_entity_id params)
  backend/app/agents/onboarding_agent/llm.py      (history in llm_compose_reply)

ARCHIVED (keep file, remove coordinator import):
  backend/app/agents/shared/natural_language.py
```
