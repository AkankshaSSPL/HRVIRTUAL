"""SessionManager – conversation session & message persistence."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.agents.models import ConversationSession, ConversationMessage

SESSION_TTL_MINUTES = 30


class SessionManager:
    def __init__(self, db: Session) -> None:
        self.db = db

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

    def append(
        self,
        session: ConversationSession,
        role: str,
        content: str,
        agent: str | None = None,
        metadata: dict | None = None,
    ) -> None:
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