"""Pay-Type REST endpoints — sync, matching the rest of the payroll API."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import require_permissions
from app.db.session import get_db
from app.models.payroll import PayType, PayTypeRule
from app.services.pay_type_service import PayTypeSyncService

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class PayTypeRuleOut(BaseModel):
    id: UUID
    pay_type_id: UUID
    sequence: int
    code: str
    label: str
    kind: str
    calc_type: str
    value: float | None = None
    reference_code: str | None = None
    formula: str | None = None
    taxable: bool
    prorate: bool
    model_config = ConfigDict(from_attributes=True)


class PayTypeOut(BaseModel):
    id: UUID
    code: str
    name: str
    pay_basis: str
    proration_basis: str
    base_working_days: int | None = None
    active: bool
    description: str | None = None
    rules: list[PayTypeRuleOut] = []
    model_config = ConfigDict(from_attributes=True)


class PayTypeCreateRequest(BaseModel):
    code: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    pay_basis: str = "STRUCTURE"
    proration_basis: str = "CALENDAR_WORKING_DAYS"
    base_working_days: int | None = None
    description: str | None = None


class PayTypeUpdateRequest(BaseModel):
    name: str | None = None
    pay_basis: str | None = None
    proration_basis: str | None = None
    base_working_days: int | None = None
    description: str | None = None
    active: bool | None = None


class PayTypeRuleRequest(BaseModel):
    sequence: int | None = None
    code: str
    label: str | None = None
    kind: str  # EARNING | DEDUCTION | EMPLOYER_CONTRIBUTION
    calc_type: str  # FIXED | PERCENT_OF | FORMULA | STATUTORY_EPF | STATUTORY_PT | STATUTORY_TDS | FLAT_TDS | LEAVE_DEDUCTION
    value: float | None = None
    reference_code: str | None = None
    formula: str | None = None
    taxable: bool = True
    prorate: bool = False


class PayTypeSetRulesRequest(BaseModel):
    rules: list[PayTypeRuleRequest]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _pt_out(pt: PayType) -> PayTypeOut:
    return PayTypeOut(
        id=pt.id, code=pt.code, name=pt.name, pay_basis=pt.pay_basis,
        proration_basis=pt.proration_basis, base_working_days=pt.base_working_days,
        active=pt.active, description=pt.description,
        rules=[PayTypeRuleOut(
            id=r.id, pay_type_id=r.pay_type_id, sequence=r.sequence,
            code=r.code, label=r.label, kind=r.kind, calc_type=r.calc_type,
            value=float(r.value) if r.value is not None else None,
            reference_code=r.reference_code, formula=r.formula,
            taxable=r.taxable, prorate=r.prorate,
        ) for r in sorted(pt.rules, key=lambda r: r.sequence) if r.deleted_at is None],
    )


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[PayTypeOut], dependencies=[Depends(require_permissions("payroll:view"))])
def list_pay_types(active_only: bool = True, db: Session = Depends(get_db)) -> list[PayTypeOut]:
    svc = PayTypeSyncService(db)
    return [_pt_out(pt) for pt in svc.list_pay_types(active_only=active_only)]


@router.get("/{pay_type_id}", response_model=PayTypeOut, dependencies=[Depends(require_permissions("payroll:view"))])
def get_pay_type(pay_type_id: UUID, db: Session = Depends(get_db)) -> PayTypeOut:
    return _pt_out(PayTypeSyncService(db).get_by_id(pay_type_id))


@router.post("/", response_model=PayTypeOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permissions("payroll:manage"))])
def create_pay_type(payload: PayTypeCreateRequest, db: Session = Depends(get_db)) -> PayTypeOut:
    svc = PayTypeSyncService(db)
    pt = svc.create_pay_type(
        code=payload.code, name=payload.name, pay_basis=payload.pay_basis,
        proration_basis=payload.proration_basis, base_working_days=payload.base_working_days,
        description=payload.description,
    )
    return _pt_out(pt)


@router.put("/{pay_type_id}", response_model=PayTypeOut, dependencies=[Depends(require_permissions("payroll:manage"))])
def update_pay_type(pay_type_id: UUID, payload: PayTypeUpdateRequest, db: Session = Depends(get_db)) -> PayTypeOut:
    svc = PayTypeSyncService(db)
    fields = payload.model_dump(exclude_unset=True)
    pt = svc.update_pay_type(pay_type_id, **fields)
    return _pt_out(pt)


@router.delete("/{pay_type_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, dependencies=[Depends(require_permissions("payroll:manage"))])
def delete_pay_type(pay_type_id: UUID, db: Session = Depends(get_db)):
    PayTypeSyncService(db).delete_pay_type(pay_type_id)


@router.put("/{pay_type_id}/rules", response_model=PayTypeOut, dependencies=[Depends(require_permissions("payroll:manage"))])
def set_pay_type_rules(pay_type_id: UUID, payload: PayTypeSetRulesRequest, db: Session = Depends(get_db)) -> PayTypeOut:
    svc = PayTypeSyncService(db)
    rules = [r.model_dump() for r in payload.rules]
    pt = svc.set_rules(pay_type_id, rules)
    return _pt_out(pt)


@router.post("/{pay_type_id}/rules", response_model=PayTypeRuleOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permissions("payroll:manage"))])
def add_pay_type_rule(pay_type_id: UUID, payload: PayTypeRuleRequest, db: Session = Depends(get_db)) -> PayTypeRuleOut:
    svc = PayTypeSyncService(db)
    rule = svc.add_rule(pay_type_id, **payload.model_dump())
    return PayTypeRuleOut(
        id=rule.id, pay_type_id=rule.pay_type_id, sequence=rule.sequence,
        code=rule.code, label=rule.label, kind=rule.kind, calc_type=rule.calc_type,
        value=float(rule.value) if rule.value is not None else None,
        reference_code=rule.reference_code, formula=rule.formula,
        taxable=rule.taxable, prorate=rule.prorate,
    )


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, dependencies=[Depends(require_permissions("payroll:manage"))])
def delete_pay_type_rule(rule_id: UUID, db: Session = Depends(get_db)):
    PayTypeSyncService(db).delete_rule(rule_id)