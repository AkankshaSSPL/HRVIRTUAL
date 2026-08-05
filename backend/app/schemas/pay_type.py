from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime

# PayTypeRule schemas
class PayTypeRuleBase(BaseModel):
    name: Optional[str] = None
    label: Optional[str] = None
    code: Optional[str] = None
    kind: Optional[str] = None
    calc_type: Optional[str] = None
    value: Optional[float] = None
    reference_code: Optional[str] = None
    formula: Optional[str] = None
    taxable: Optional[bool] = None
    prorate: Optional[bool] = None
    priority: Optional[int] = 1
    sequence: Optional[int] = 1
    is_active: Optional[bool] = True
    active: Optional[bool] = True
    effective_start: Optional[datetime] = None
    effective_end: Optional[datetime] = None
    multiplier: Optional[float] = None
    flat_amount: Optional[float] = None

class PayTypeRuleCreate(PayTypeRuleBase):
    pass

class PayTypeRuleUpdate(PayTypeRuleBase):
    pass

class PayTypeRuleResponse(PayTypeRuleBase):
    id: UUID
    pay_type_id: UUID

    model_config = ConfigDict(from_attributes=True)

# PayType schemas
class PayTypeBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    pay_basis: Optional[str] = "STRUCTURE"
    proration_basis: Optional[str] = "CALENDAR_WORKING_DAYS"
    base_working_days: Optional[int] = None
    is_active: Optional[bool] = True
    active: Optional[bool] = True

class PayTypeCreate(PayTypeBase):
    pass

class PayTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    active: Optional[bool] = None

class PayTypeResponse(PayTypeBase):
    id: UUID
    rules: Optional[List[PayTypeRuleResponse]] = []

    model_config = ConfigDict(from_attributes=True)
