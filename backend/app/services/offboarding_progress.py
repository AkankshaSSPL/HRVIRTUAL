"""Compute the offboarding checklist for an employee: auto-derived state
(read live from Employee/User/assets) combined with the manual flags HR
ticks on the OffboardingCase.

Written to mirror onboarding_progress.py's compute_onboarding_progress()
pattern, but that file's actual content wasn't available in this session —
the shape below (percent/items/can_finalize) is inferred from how Part B
of the plan describes consuming it (GET/PATCH /offboarding/{id} return
"case + computed checklist"). If onboarding_progress.py's real return
shape differs (e.g. a dict instead of a dataclass, different field names),
align this to match it for consistency.

ASSUMPTIONS THAT NEED VERIFICATION against the real models:
  - Employee has an `assets` relationship to EmployeeAsset.
  - EmployeeAsset has a `status` field with value "RETURNED" among others.
  - Employee has a `seat_label` field (used elsewhere in the plan as the
    seat-released signal).
  - User has a `face_registered` boolean field.
  - Employee has a `user` relationship to User.
"""
from dataclasses import dataclass, field
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.employee.models import Employee, EmployeeAsset, OffboardingCase


@dataclass
class ChecklistItem:
    key: str
    label: str
    complete: bool
    auto: bool


@dataclass
class OffboardingChecklist:
    percent: int
    items: List[ChecklistItem] = field(default_factory=list)
    can_finalize: bool = False


def compute_offboarding_progress(
    db: Session, employee: Employee, case: OffboardingCase
) -> OffboardingChecklist:
    items: List[ChecklistItem] = []

    # --- Auto-derived (read live state; HR can't fake these) ---
    assets = list(getattr(employee, "assets", []) or [])
    assets_returned = all(getattr(a, "status", None) == "RETURNED" for a in assets)
    items.append(ChecklistItem("assets_returned", "Assets returned", assets_returned, auto=True))

    seat_released = getattr(employee, "seat_label", None) is None
    items.append(ChecklistItem("seat_released", "Seat released", seat_released, auto=True))

    user = getattr(employee, "user", None)
    access_revoked = bool(user is not None and getattr(user, "is_active", True) is False)
    items.append(ChecklistItem("access_revoked", "Access revoked", access_revoked, auto=True))

    face_removed = bool(user is not None and getattr(user, "face_registered", False) is False)
    items.append(ChecklistItem("face_removed", "Face login removed", face_removed, auto=True))

    # --- Manual (HR-ticked, from OffboardingCase) ---
    manual_pairs = [
        ("id_card_returned", "ID card returned"),
        ("nda_signed", "NDA signed"),
        ("client_credentials_cleared", "Client credentials cleared"),
        ("personal_logins_cleared", "Personal logins cleared"),
        ("recovery_details_updated", "Recovery details updated to HR"),
    ]
    for key, label in manual_pairs:
        items.append(ChecklistItem(key, label, bool(getattr(case, key)), auto=False))

    complete_count = sum(1 for i in items if i.complete)
    percent = round((complete_count / len(items)) * 100) if items else 0

    # can_finalize is true only when all MANUAL items are done — the auto
    # items (asset/seat/access/face) are handled by finalize itself, not a
    # precondition for calling it.
    can_finalize = all(i.complete for i in items if not i.auto)

    return OffboardingChecklist(percent=percent, items=items, can_finalize=can_finalize)
