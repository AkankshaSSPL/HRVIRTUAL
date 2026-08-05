"""Tests for PayType and PayTypeRule CRUD via the sync service."""

import pytest
from uuid import uuid4

from sqlalchemy.orm import Session

from app.services.pay_type_service import PayTypeSyncService


def test_create_and_get_pay_type(db_session: Session):
    svc = PayTypeSyncService(db_session)
    unique_code = f"OVERTIME_{uuid4().hex[:6].upper()}"

    created = svc.create_pay_type(
        code=unique_code, name="Overtime Pay", description="1.5x regular rate",
    )
    assert created.id is not None
    assert created.code == unique_code

    fetched = svc.get_by_id(created.id)
    assert fetched.id == created.id
    assert fetched.name == "Overtime Pay"


def test_update_and_delete_pay_type(db_session: Session):
    svc = PayTypeSyncService(db_session)
    code = f"BONUS_{uuid4().hex[:6].upper()}"

    pay_type = svc.create_pay_type(code=code, name="Holiday Bonus", description="Annual bonus")

    updated = svc.update_pay_type(pay_type.id, name="Updated Holiday Bonus")
    assert updated.name == "Updated Holiday Bonus"

    svc.delete_pay_type(pay_type.id)
    # After soft-delete, get_by_id should raise
    with pytest.raises(Exception):
        svc.get_by_id(pay_type.id)


def test_add_and_set_rules(db_session: Session):
    svc = PayTypeSyncService(db_session)
    code = f"INTERN_{uuid4().hex[:6].upper()}"

    pt = svc.create_pay_type(code=code, name="Intern", pay_basis="FLAT_FEE")

    rule = svc.add_rule(pt.id, code="MONTHLY_FEE", label="Monthly Fee", kind="EARNING", calc_type="FIXED")
    assert rule.code == "MONTHLY_FEE"
    assert rule.pay_type_id == pt.id

    # Replace rules wholesale
    pt = svc.set_rules(pt.id, [
        {"code": "STIPEND", "label": "Stipend", "kind": "EARNING", "calc_type": "FIXED", "value": 15000},
        {"code": "TDS", "label": "TDS", "kind": "DEDUCTION", "calc_type": "FLAT_TDS", "value": 5},
    ])
    active_rules = [r for r in pt.rules if r.deleted_at is None]
    assert len(active_rules) == 2
    assert active_rules[0].code == "STIPEND"