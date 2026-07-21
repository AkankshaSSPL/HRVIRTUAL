from __future__ import annotations

import re
from typing import Any
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.shared.base_agent import BaseAgent
from app.agents.salary_structure_agent.tools import parse_salary_structure_command, structure_query_from_command, validate_components
from app.models.payroll import SalaryStructure, SalaryStructureItem, SalaryComponent


class SalaryStructureAgent(BaseAgent):
    name = "salary_structure_agent"
    description = "Manage salary structures composed from salary components."
    supported_actions = ["inspect", "create_structure", "update_structure", "delete_structure", "preview", "list"]
    approval_required_actions = []

    def __init__(self, db: Session | None = None) -> None:
        self.db = db

    async def run(self, state):  # pragma: no cover - BaseAgent compatibility
        return {"message": "SalaryStructureAgent requires runtime invocation."}

    def execute(self, *, action: str, command: str, user_id=None, workflow_id: str | None = None) -> dict[str, Any]:
        if self.db is None:
            raise RuntimeError("SalaryStructureAgent requires a database session")

        act = self._classify_action(action, command)

        if act == "delete_structure":
            structure = self._find_structure(structure_query_from_command(command))
            if not structure:
                return self._status_response("Salary structure not found", "I could not find that salary structure in the active structure list.")
            structure.active = False
            structure.deleted_at = datetime.now(timezone.utc)
            structure.updated_at = datetime.now(timezone.utc)
            self.db.add(structure)
            self.db.commit()
            return self._structure_card_response("Salary structure removed", "The salary structure was removed from the active list.", structure, [])

        if act == "update_structure":
            parsed = parse_salary_structure_command(command)
            structure = self._find_structure(parsed["name"])
            missing, items = validate_components(self.db, parsed["items"])
            if missing:
                return self._missing_components_response(parsed, missing)
            computed = self._compute_items(items)
            now = datetime.now(timezone.utc)
            if not structure:
                structure = SalaryStructure(name=parsed["name"], code=parsed["code"], active=True, created_at=now, updated_at=now)
                self.db.add(structure)
                self.db.flush()
                self._add_items(structure, items, now)
                self.db.commit()
                self.db.refresh(structure)
                return self._structure_card_response("Salary structure created", "The salary structure did not exist, so I created it with the provided rules.", structure, computed)
            structure.name = parsed["name"]
            structure.code = parsed["code"]
            structure.updated_at = now
            structure.items.clear()
            self.db.flush()
            self._add_items(structure, items, now)
            self.db.commit()
            self.db.refresh(structure)
            return self._structure_card_response("Salary structure updated", "The salary structure was updated successfully.", structure, computed)

        if act == "create_structure":
            parsed = parse_salary_structure_command(command)
            missing, items = validate_components(self.db, parsed["items"])
            if missing:
                return self._missing_components_response(parsed, missing)

            # Build preview using an example gross of 100000
            computed = self._compute_items(items)

            # Explicit create/add/save commands persist immediately. Preview-only
            # language remains non-persistent.
            normalized_command = command.lower()
            should_save = any(word in normalized_command for word in ("create", "add", "save", "confirm")) and "preview" not in normalized_command
            if should_save:
                # Check for duplicate structure name or code
                try:
                    existing = self.db.scalar(
                        select(SalaryStructure).where(
                            SalaryStructure.deleted_at.is_(None),
                            (SalaryStructure.code == parsed["code"]) | (SalaryStructure.name.ilike(parsed["name"]))
                        )
                    )
                except Exception:
                    # If the table/migration isn't present in local/test DB, treat as no existing record
                    existing = None
                if existing:
                    return {
                        "agent": self.name,
                        "action": "create_structure",
                        "message": "Validation failed: duplicate structure",
                        "execution_status": "Failed",
                        "workflow_status": "FAILED",
                        "structured_response": {
                            "type": "salary_structure_duplicate",
                            "title": parsed["name"],
                            "summary": "A salary structure with this name or code already exists.",
                            "existing_code": existing.code if existing else None,
                        },
                    }

                try:
                    now = datetime.now(timezone.utc)
                    structure = SalaryStructure(name=parsed["name"], code=parsed["code"], active=True, created_at=now, updated_at=now)
                    self.db.add(structure)
                    self.db.flush()
                    self._add_items(structure, items, now)
                    self.db.commit()
                    self.db.refresh(structure)
                except Exception as exc:
                    try:
                        self.db.rollback()
                    except Exception:
                        pass
                    return {
                        "agent": self.name,
                        "action": "create_structure",
                        "message": f"Failed to save salary structure: {str(exc)}",
                        "execution_status": "Failed",
                        "workflow_status": "FAILED",
                        "structured_response": {
                            "type": "salary_structure_error",
                            "title": parsed["name"],
                            "summary": "An error occurred while saving the salary structure.",
                            "error": str(exc),
                        },
                    }
                return self._structure_card_response(structure.name, "Salary structure saved.", structure, computed)

            # Otherwise return preview
            return self._structure_preview_response(parsed, computed, "Preview for salary structure (example gross = 100000)")

        # default: list
        structures = self.db.scalars(select(SalaryStructure).where(SalaryStructure.deleted_at.is_(None)).order_by(SalaryStructure.name.asc())).all()
        return {
            "agent": self.name,
            "action": "list",
            "message": "Salary structures loaded.",
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "structured_response": {
                "type": "salary_structure_table",
                "title": "Salary Structures",
                "structures": [
                    {"id": str(s.id), "name": s.name, "code": s.code, "active": s.active, "item_count": len(s.items) if s.items is not None else 0} for s in structures
                ],
            },
        }

    def _classify_action(self, action: str, command: str) -> str:
        normalized = command.lower()
        if any(word in normalized for word in ("remove", "delete")) and "salary" in normalized and "structure" in normalized:
            return "delete_structure"
        if any(word in normalized for word in ("update", "change")) and "salary" in normalized and "structure" in normalized:
            return "update_structure"
        if any(word in normalized for word in ("create", "save", "confirm", "add")) and "salary" in normalized and "structure" in normalized:
            return "create_structure"
        return action if action in self.supported_actions else "inspect"

    def _find_structure(self, query: str) -> SalaryStructure | None:
        return self.db.scalar(
            select(SalaryStructure)
            .where(SalaryStructure.deleted_at.is_(None))
            .where((SalaryStructure.code == f"SS_{query.upper().replace(' ', '_')}") | (SalaryStructure.name.ilike(f"%{query}%")))
            .limit(1)
        )

    def _compute_items(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        gross = 100000.0
        computed = []
        amounts = {}
        for item in items:
            if item["calculation_type"] == "fixed":
                amount = item.get("calculation_value") or 0.0
            elif item["calculation_type"] == "percentage" and not item.get("reference_component_code"):
                amount = gross * (item.get("calculation_value") or 0.0) / 100.0
            elif item["calculation_type"] == "percentage" and item.get("reference_component_code"):
                reference = item.get("reference_component_code")
                reference_amount = gross if reference in {"GROSS", "GROSS_SALARY"} else amounts.get(reference, 0.0)
                amount = reference_amount * (item.get("calculation_value") or 0.0) / 100.0
            elif item["calculation_type"] in {"balance", "formula"}:
                amount = self._evaluate_preview_formula(item.get("formula"), gross, amounts)
            else:
                amount = 0.0
            amounts[item["component_code"]] = amount
            computed.append({**item, "amount": amount})
        return computed

    def _evaluate_preview_formula(self, formula: str | None, gross: float, amounts: dict[str, float]) -> float:
        if not formula:
            return 0.0
        expression = formula.upper()
        values = {"GROSS": gross, "GROSS_SALARY": gross, "CTC": gross, **amounts}
        for token in sorted(values, key=len, reverse=True):
            expression = re.sub(rf"\b{re.escape(token)}\b", str(values[token]), expression)
        if re.search(r"[^0-9+\-*/().\s]", expression):
            return 0.0
        try:
            return float(eval(expression, {"__builtins__": {}}, {}))
        except Exception:
            return 0.0

    def _add_items(self, structure: SalaryStructure, items: list[dict[str, Any]], now: datetime) -> None:
        for order, item in enumerate(items, start=1):
            self.db.add(
                SalaryStructureItem(
                    structure_id=structure.id,
                    component_code=item["component_code"],
                    calculation_type=item["calculation_type"],
                    calculation_value=item.get("calculation_value"),
                    formula=item.get("formula"),
                    reference_component_code=item.get("reference_component_code"),
                    sort_order=order,
                    created_at=now,
                    updated_at=now,
                )
            )

    def _structure_preview_response(self, parsed: dict[str, Any], items: list[dict[str, Any]], summary: str, failed: bool = False) -> dict[str, Any]:
        return {
            "agent": self.name,
            "action": "preview",
            "message": summary,
            "execution_status": "Failed" if failed else "Completed",
            "workflow_status": "FAILED" if failed else "COMPLETED",
            "structured_response": {
                "type": "salary_structure_preview",
                "title": parsed["name"],
                "structure_code": parsed["code"],
                "summary": summary,
                "gross": 100000.0,
                "component_count": len(items),
                "items": items,
            },
        }

    def _structure_card_response(self, title: str, summary: str, structure: SalaryStructure, items: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Salary Structure Agent",
            "action": "create_structure",
            "message": summary,
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "structured_response": {
                "type": "salary_structure_card",
                "title": title,
                "structure_code": structure.code,
                "summary": summary,
                "structure_id": str(structure.id),
                "component_count": len(items),
                "items": items,
            },
        }

    def _status_response(self, title: str, summary: str) -> dict[str, Any]:
        return {
            "agent": self.name,
            "agent_display_name": "Salary Structure Agent",
            "action": "status",
            "message": summary,
            "execution_status": "Completed",
            "workflow_status": "Completed",
            "structured_response": {"type": "status_banner", "title": title, "summary": summary, "payload": {}},
        }

    def _missing_components_response(self, parsed: dict[str, Any], missing: list[str]) -> dict[str, Any]:
        component_names = ", ".join(missing)
        summary = (
            f"The {parsed['name']} salary structure was not created because these reusable salary components "
            f"do not exist yet: {component_names}. Create the missing components, then send the structure command again."
        )
        return {
            "agent": self.name,
            "agent_display_name": "Salary Structure Agent",
            "action": "clarification",
            "message": summary,
            "execution_status": "Needs review",
            "workflow_status": "Needs review",
            "structured_response": {
                "type": "status_banner",
                "title": "Salary components are missing",
                "summary": summary,
                "payload": {
                    "structure_name": parsed["name"],
                    "missing_components": missing,
                },
            },
        }
