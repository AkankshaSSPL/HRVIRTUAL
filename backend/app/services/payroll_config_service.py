from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.payroll import PayrollConfig


class PayrollConfigService:
    """Single source of truth for statutory payroll rates. Every rate used
    in payroll computation or export must come through this service —
    never hardcode EPF/PT/TDS rates elsewhere."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self) -> PayrollConfig:
        config = self.db.scalar(
            select(PayrollConfig)
            .where(PayrollConfig.active == True)  # noqa: E712
            .where(PayrollConfig.deleted_at.is_(None))
        )
        if not config:
            raise RuntimeError(
                "No active PayrollConfig found. Run migration 20260729_0033 "
                "or create one via PUT /payroll/config."
            )
        return config

    def get_professional_tax(self, month: int) -> int:
        """Fixed PT: 300 for February (month 2), 200 otherwise."""
        return 300 if month == 2 else 200