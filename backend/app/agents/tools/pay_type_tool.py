"""Agent tool wrapper for PayType operations — uses the sync service."""

from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import UUID

from app.db.session import SessionLocal
from app.services.pay_type_service import PayTypeSyncService


class PayTypeAgentTools:
    """Agent tool wrapper for PayType operations and rule resolution."""

    @staticmethod
    def get_pay_type_details(pay_type_id: str) -> Dict[str, Any]:
        """Tool for agents to fetch details of a specific pay type by ID."""
        with SessionLocal() as db:
            svc = PayTypeSyncService(db)
            try:
                pay_type = svc.get_by_id(UUID(pay_type_id))
                return {
                    "status": "success",
                    "data": {
                        "id": str(pay_type.id),
                        "code": pay_type.code,
                        "name": pay_type.name,
                        "pay_basis": pay_type.pay_basis,
                        "description": pay_type.description,
                        "active": pay_type.active,
                        "rules": [
                            {
                                "code": r.code,
                                "label": r.label,
                                "kind": r.kind,
                                "calc_type": r.calc_type,
                                "value": float(r.value) if r.value is not None else None,
                            }
                            for r in pay_type.rules if r.deleted_at is None
                        ],
                    },
                }
            except Exception as e:
                return {"status": "error", "message": str(e)}

    @staticmethod
    def list_active_pay_types(limit: int = 50) -> Dict[str, Any]:
        """Tool for agents to query all active pay types."""
        with SessionLocal() as db:
            svc = PayTypeSyncService(db)
            try:
                pay_types = svc.list_pay_types(active_only=True)
                return {
                    "status": "success",
                    "count": len(pay_types),
                    "data": [
                        {
                            "id": str(pt.id),
                            "code": pt.code,
                            "name": pt.name,
                            "pay_basis": pt.pay_basis,
                            "description": pt.description,
                            "rule_count": len([r for r in pt.rules if r.deleted_at is None]),
                        }
                        for pt in pay_types
                    ],
                }
            except Exception as e:
                return {"status": "error", "message": str(e)}

    @staticmethod
    def create_pay_type(
        code: str, name: str, pay_basis: str = "STRUCTURE",
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """Tool for agents to create a new pay type entity."""
        with SessionLocal() as db:
            svc = PayTypeSyncService(db)
            try:
                pay_type = svc.create_pay_type(
                    code=code, name=name, pay_basis=pay_basis, description=description,
                )
                return {
                    "status": "success",
                    "data": {
                        "id": str(pay_type.id),
                        "code": pay_type.code,
                        "name": pay_type.name,
                    },
                }
            except Exception as e:
                return {"status": "error", "message": str(e)}

    @staticmethod
    def add_rule_to_pay_type(
        pay_type_id: str, code: str, label: str, kind: str, calc_type: str,
        value: Optional[float] = None, reference_code: Optional[str] = None,
        formula: Optional[str] = None, taxable: bool = True, prorate: bool = False,
    ) -> Dict[str, Any]:
        """Tool for agents to add a rule to a pay type."""
        with SessionLocal() as db:
            svc = PayTypeSyncService(db)
            try:
                rule = svc.add_rule(
                    UUID(pay_type_id),
                    code=code, label=label, kind=kind, calc_type=calc_type,
                    value=value, reference_code=reference_code,
                    formula=formula, taxable=taxable, prorate=prorate,
                )
                return {
                    "status": "success",
                    "data": {
                        "id": str(rule.id),
                        "code": rule.code,
                        "label": rule.label,
                    },
                }
            except Exception as e:
                return {"status": "error", "message": str(e)}