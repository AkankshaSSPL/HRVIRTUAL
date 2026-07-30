from app.agents.shared.extraction import ONBOARDING_REQUIRED_FIELDS, extract_onboarding_entities
from app.agents.onboarding_agent.handlers import _validate_required_candidate
from app.agents.onboarding_agent.tools import DOCUMENT_CHECKLIST

def test_fields():
    print("Required fields defined:", ONBOARDING_REQUIRED_FIELDS)
    assert "email" in ONBOARDING_REQUIRED_FIELDS
    assert "phone" in ONBOARDING_REQUIRED_FIELDS
    assert "dob" in ONBOARDING_REQUIRED_FIELDS
    assert "gender" in ONBOARDING_REQUIRED_FIELDS
    assert "joining_date" in ONBOARDING_REQUIRED_FIELDS
    assert "designation" in ONBOARDING_REQUIRED_FIELDS
    assert "address" in ONBOARDING_REQUIRED_FIELDS
    assert "zip_code" in ONBOARDING_REQUIRED_FIELDS
    assert "city" in ONBOARDING_REQUIRED_FIELDS
    assert "bank_account_number" in ONBOARDING_REQUIRED_FIELDS
    assert "ifsc_code" in ONBOARDING_REQUIRED_FIELDS
    assert "bank_branch" in ONBOARDING_REQUIRED_FIELDS
    assert "emergency_code" in ONBOARDING_REQUIRED_FIELDS

    doc_names = [d["name"] for d in DOCUMENT_CHECKLIST]
    print("Document Checklist:", doc_names)
    assert "Education Certificate" in doc_names
    assert "Address Proof" in doc_names

    candidate = {
        "name": "Jane Doe",
        "email": "jane@example.com",
        "phone": "+1 234 567 8900",
        "dob": "1995-05-15",
        "gender": "Female",
        "joining_date": "2026-08-01",
        "designation": "Software Engineer",
        "address": "123 Main St",
        "zip_code": "94105",
        "city": "San Francisco",
        "bank_account_number": "123456789",
        "ifsc_code": "HDFC0001234",
        "bank_branch": "Downtown Branch",
        "emergency_code": "ICE-9912",
    }
    _validate_required_candidate(candidate)
    print("Full candidate validation PASSED!")

    # Verify missing check
    try:
        _validate_required_candidate({"name": "Jane Doe"})
    except ValueError as exc:
        print("Incomplete candidate caught as expected:", exc)

if __name__ == "__main__":
    test_fields()
