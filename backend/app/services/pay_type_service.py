"""Pay-Type service — sync, matches the rest of the app."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.payroll import PayType, PayTypeRule


class PayTypeSyncService:
    """CRUD for PayType + PayTypeRule masters. Single source of truth for both
    REST endpoints and agent commands."""

    def __init__(self, db: Session):
        self.db = db

    # ── PayType CRUD ──────────────────────────────────────────────────

    def list_pay_types(self, *, active_only: bool = True) -> list[PayType]:
        q = select(PayType).where(PayType.deleted_at.is_(None))
        if active_only:
            q = q.where(PayType.active == True)  # noqa: E712
        q = q.options(selectinload(PayType.rules)).order_by(PayType.code)
        return list(self.db.scalars(q).all())

    def get_by_id(self, pay_type_id: UUID) -> PayType:
        pt = self.db.scalar(
            select(PayType)
            .where(PayType.id == pay_type_id, PayType.deleted_at.is_(None))
            .options(selectinload(PayType.rules))
        )
        if not pt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pay type not found.")
        return pt

    def get_by_code(self, code: str) -> PayType | None:
        return self.db.scalar(
            select(PayType)
            .where(PayType.code == code, PayType.active == True, PayType.deleted_at.is_(None))  # noqa: E712
            .options(selectinload(PayType.rules))
        )

    def create_pay_type(self, *, code: str, name: str, pay_basis: str = "STRUCTURE",
                        proration_basis: str = "CALENDAR_WORKING_DAYS",
                        base_working_days: int | None = None,
                        description: str | None = None) -> PayType:
        existing = self.db.scalar(select(PayType).where(PayType.code == code, PayType.deleted_at.is_(None)))
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Pay type with code '{code}' already exists.")
        now = datetime.now(timezone.utc)
        pt = PayType(
            code=code, name=name, pay_basis=pay_basis,
            proration_basis=proration_basis, base_working_days=base_working_days,
            description=description, active=True, created_at=now, updated_at=now,
        )
        self.db.add(pt)
        self.db.commit()
        self.db.refresh(pt)
        return pt

    def update_pay_type(self, pay_type_id: UUID, **fields) -> PayType:
        pt = self.get_by_id(pay_type_id)
        now = datetime.now(timezone.utc)
        for key, value in fields.items():
            if hasattr(pt, key):
                setattr(pt, key, value)
        pt.updated_at = now
        self.db.commit()
        self.db.refresh(pt)
        return pt

    def delete_pay_type(self, pay_type_id: UUID) -> None:
        pt = self.get_by_id(pay_type_id)
        pt.deleted_at = datetime.now(timezone.utc)
        self.db.commit()

    # ── PayTypeRule CRUD ──────────────────────────────────────────────

    def set_rules(self, pay_type_id: UUID, rules: list[dict]) -> PayType:
        """Replace the rule set of a pay type wholesale."""
        pt = self.get_by_id(pay_type_id)
        now = datetime.now(timezone.utc)
        # Soft-delete old rules
        for old in pt.rules:
            old.deleted_at = now
        self.db.flush()
        for idx, rule_data in enumerate(rules):
            rule = PayTypeRule(
                pay_type_id=pay_type_id,
                sequence=rule_data.get("sequence", idx + 1),
                code=rule_data["code"],
                label=rule_data.get("label", rule_data["code"]),
                kind=rule_data["kind"],
                calc_type=rule_data["calc_type"],
                value=rule_data.get("value"),
                reference_code=rule_data.get("reference_code"),
                formula=rule_data.get("formula"),
                taxable=rule_data.get("taxable", True),
                prorate=rule_data.get("prorate", False),
                created_at=now, updated_at=now,
            )
            self.db.add(rule)
        self.db.commit()
        self.db.refresh(pt)
        return pt

    def add_rule(self, pay_type_id: UUID, **rule_data) -> PayTypeRule:
        pt = self.get_by_id(pay_type_id)
        now = datetime.now(timezone.utc)
        max_seq = max((r.sequence for r in pt.rules if r.deleted_at is None), default=0)
        rule = PayTypeRule(
            pay_type_id=pay_type_id,
            sequence=rule_data.get("sequence", max_seq + 1),
            code=rule_data["code"],
            label=rule_data.get("label", rule_data["code"]),
            kind=rule_data["kind"],
            calc_type=rule_data["calc_type"],
            value=rule_data.get("value"),
            reference_code=rule_data.get("reference_code"),
            formula=rule_data.get("formula"),
            taxable=rule_data.get("taxable", True),
            prorate=rule_data.get("prorate", False),
            created_at=now, updated_at=now,
        )
        self.db.add(rule)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def delete_rule(self, rule_id: UUID) -> None:
        rule = self.db.get(PayTypeRule, rule_id)
        if not rule or rule.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found.")
        rule.deleted_at = datetime.now(timezone.utc)
        self.db.commit()